import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { hasPermission } from '../common/auth/auth-principal';
import {
  AuditActorType,
  ClientReviewDecisionType,
  ClientReviewLinkStatus,
  Prisma,
  TitleDecisionType,
  TitleStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TitleWorkflowService } from '../titles/title-workflow.service';
import type { ClientReviewDecisionDto } from './dto/client-review-decision.dto';
import type { CreateReviewLinkDto } from './dto/create-review-link.dto';
import type { ReviewDispatchDto } from './dto/review-dispatch.dto';
import {
  createRecoverableReviewCredentials,
  hashReviewToken,
  isRecoverableReviewToken,
  recoverableReviewToken,
} from './recoverable-review-token';
import { buildTitleReviewUrl } from './title-review-url';

const reviewableStatuses: TitleStatus[] = [
  TitleStatus.PROPOSED,
  TitleStatus.EVALUATING,
];

@Injectable()
export class TitleReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workflow: TitleWorkflowService,
  ) {}

  async create(
    proposalId: string,
    input: CreateReviewLinkDto,
    principal: AuthPrincipal,
  ) {
    const proposal = await this.prisma.titleProposal.findFirst({
      where: { id: proposalId, tenantId: principal.tenantId },
    });
    if (!proposal) throw new NotFoundException('Título no encontrado.');
    this.assertClientPermission(principal, proposal.clientId);
    const evaluation = await this.prisma.titleEvaluation.findFirst({
      where: {
        proposalId,
        version: proposal.currentVersion,
      },
      orderBy: { createdAt: 'desc' },
    });
    this.workflow.assertCanDecide(
      proposal.status,
      TitleDecisionType.APPROVE,
      proposal.duplicateScore,
      proposal.duplicateResolution,
      evaluation ?? undefined,
    );

    const credentials = createRecoverableReviewCredentials(
      'title',
      this.reviewTokenSecret(),
    );
    const token = credentials.token;
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const link = await this.prisma.$transaction(async (tx) => {
      await tx.titleReviewLink.updateMany({
        where: { proposalId, status: ClientReviewLinkStatus.ACTIVE },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedById: principal.userId,
          revokedAt: new Date(),
        },
      });
      const created = await tx.titleReviewLink.create({
        data: {
          id: credentials.id,
          tenantId: principal.tenantId,
          clientId: proposal.clientId,
          proposalId,
          version: proposal.currentVersion,
          tokenHash: credentials.tokenHash,
          recipientName: input.recipientName.trim(),
          recipientEmail: input.recipientEmail.trim().toLowerCase(),
          expiresAt,
          createdById: principal.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: proposal.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action: 'title_client_review.link.created',
          entityType: 'title_review_link',
          entityId: created.id,
          after: {
            proposalId,
            version: proposal.currentVersion,
            expiresAt: expiresAt.toISOString(),
          },
          metadata: { recipientEmail: created.recipientEmail },
        },
      });
      return created;
    });
    const baseUrl = this.config
      .getOrThrow<string>('PUBLIC_WEB_URL')
      .replace(/\/$/, '');
    return {
      id: link.id,
      reviewUrl: buildTitleReviewUrl(baseUrl, token),
      expiresAt,
      status: link.status,
    };
  }

  async list(proposalId: string, principal: AuthPrincipal) {
    const proposal = await this.prisma.titleProposal.findFirst({
      where: { id: proposalId, tenantId: principal.tenantId },
    });
    if (!proposal) throw new NotFoundException('Título no encontrado.');
    this.assertClientPermission(principal, proposal.clientId);
    const links = await this.prisma.titleReviewLink.findMany({
      where: { proposalId, tenantId: principal.tenantId },
      select: {
        id: true,
        tokenHash: true,
        version: true,
        status: true,
        recipientName: true,
        recipientEmail: true,
        expiresAt: true,
        viewCount: true,
        maxViews: true,
        lastViewedAt: true,
        sentByEmail: true,
        emailSubject: true,
        externalMessageId: true,
        sentAt: true,
        createdAt: true,
        decision: {
          select: {
            type: true,
            reason: true,
            reviewerName: true,
            reviewerEmail: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const baseUrl = this.publicWebUrl();
    const secret = this.reviewTokenSecret();
    return links.map(({ tokenHash, ...link }) => ({
      ...link,
      reviewUrl:
        link.status === ClientReviewLinkStatus.ACTIVE &&
        link.expiresAt > new Date() &&
        isRecoverableReviewToken('title', link.id, tokenHash, secret)
          ? buildTitleReviewUrl(
              baseUrl,
              recoverableReviewToken('title', link.id, secret),
            )
          : null,
    }));
  }

  async recoverAccess(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    this.assertCanRecover(link);
    const token = recoverableReviewToken(
      'title',
      link.id,
      this.reviewTokenSecret(),
    );
    await this.prisma.$transaction([
      this.prisma.titleReviewLink.update({
        where: { id: link.id },
        data: { tokenHash: hashReviewToken(token) },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: link.tenantId,
          clientId: link.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action: 'title_client_review.link.access_recovered',
          entityType: 'title_review_link',
          entityId: link.id,
          metadata: { proposalId: link.proposalId, version: link.version },
        },
      }),
    ]);
    return {
      id: link.id,
      reviewUrl: buildTitleReviewUrl(this.publicWebUrl(), token),
      expiresAt: link.expiresAt,
      status: link.status,
    };
  }

  async revoke(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    if (link.status !== ClientReviewLinkStatus.ACTIVE) {
      throw new ConflictException('El enlace ya no está activo.');
    }
    return this.prisma.titleReviewLink.update({
      where: { id },
      data: {
        status: ClientReviewLinkStatus.REVOKED,
        revokedById: principal.userId,
        revokedAt: new Date(),
      },
    });
  }

  async markDispatched(
    id: string,
    input: ReviewDispatchDto,
    principal: AuthPrincipal,
  ) {
    const link = await this.findOwnedLink(id, principal);
    if (link.status !== ClientReviewLinkStatus.ACTIVE) {
      throw new ConflictException(
        'Solo un enlace activo puede registrarse como enviado.',
      );
    }
    const senderEmail = input.senderEmail.trim().toLowerCase();
    await this.assertSenderEmail(principal, senderEmail);
    const sentAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.titleReviewLink.update({
        where: { id },
        data: {
          sentByEmail: senderEmail,
          emailSubject: input.subject.trim(),
          externalMessageId: input.externalMessageId?.trim() || null,
          sentAt,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: link.tenantId,
          clientId: link.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action: 'title_client_review.email.sent_confirmed',
          entityType: 'title_review_link',
          entityId: id,
          after: {
            sentByEmail: senderEmail,
            subject: input.subject.trim(),
            sentAt: sentAt.toISOString(),
          },
          metadata: {
            recipientEmail: link.recipientEmail,
            externalMessageId: input.externalMessageId?.trim() || null,
          },
        },
      });
      return updated;
    });
  }

  async publicView(token: string) {
    const link = await this.findActive(token);
    const claimed = await this.prisma.titleReviewLink.updateMany({
      where: {
        id: link.id,
        status: ClientReviewLinkStatus.ACTIVE,
        viewCount: { lt: link.maxViews },
        expiresAt: { gt: new Date() },
        proposal: {
          currentVersion: link.version,
          status: { in: reviewableStatuses },
        },
      },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    const version = await this.prisma.titleVersion.findUnique({
      where: {
        proposalId_version: {
          proposalId: link.proposalId,
          version: link.version,
        },
      },
    });
    if (!version) {
      throw new GoneException('La versión compartida ya no está disponible.');
    }
    return {
      client: link.client,
      proposalId: link.proposalId,
      version: link.version,
      expiresAt: link.expiresAt,
      recipientName: link.recipientName,
      recipientEmailHint: this.emailHint(link.recipientEmail),
      content: {
        title: version.title,
        objective: version.objective,
        audience: version.audience,
        searchIntent: version.searchIntent,
        focus: version.focus,
        opportunity: version.opportunity,
        risk: version.risk,
      },
    };
  }

  async decide(
    token: string,
    input: ClientReviewDecisionDto,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const link = await this.findActive(token);
    const reviewerEmail = input.reviewerEmail.trim().toLowerCase();
    if (reviewerEmail !== link.recipientEmail) {
      throw new ForbiddenException(
        'El correo no coincide con el destinatario autorizado.',
      );
    }
    const nextStatus =
      input.type === ClientReviewDecisionType.APPROVE
        ? TitleStatus.APPROVED
        : input.type === ClientReviewDecisionType.REJECT
          ? TitleStatus.REJECTED
          : TitleStatus.CHANGES_REQUESTED;
    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.titleReviewLink.updateMany({
          where: {
            id: link.id,
            status: ClientReviewLinkStatus.ACTIVE,
            expiresAt: { gt: new Date() },
            proposal: {
              currentVersion: link.version,
              status: { in: reviewableStatuses },
            },
          },
          data: { status: ClientReviewLinkStatus.COMPLETED },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('La revisión ya fue respondida.');
        }
        const proposalClaimed = await tx.titleProposal.updateMany({
          where: {
            id: link.proposalId,
            currentVersion: link.version,
            status: { in: reviewableStatuses },
          },
          data: {
            status: nextStatus,
            approvedAt:
              input.type === ClientReviewDecisionType.APPROVE
                ? new Date()
                : null,
            approvedById: null,
          },
        });
        if (proposalClaimed.count !== 1) {
          throw new ConflictException(
            'El título cambió antes de registrar la decisión.',
          );
        }
        const decision = await tx.titleReviewDecision.create({
          data: {
            linkId: link.id,
            type: input.type,
            reason: input.reason.trim(),
            reviewerName: link.recipientName,
            reviewerEmail,
            ipAddress: context.ipAddress?.slice(0, 64),
            userAgent: context.userAgent?.slice(0, 500),
          },
        });
        await tx.titleReviewLink.updateMany({
          where: {
            proposalId: link.proposalId,
            id: { not: link.id },
            status: ClientReviewLinkStatus.ACTIVE,
          },
          data: {
            status: ClientReviewLinkStatus.REVOKED,
            revokedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: link.tenantId,
            clientId: link.clientId,
            actorType: AuditActorType.SERVICE,
            action: `title_client_review.decision.${input.type.toLowerCase()}`,
            entityType: 'title_review_link',
            entityId: link.id,
            before: { status: link.proposal.status, version: link.version },
            after: { status: nextStatus, version: link.version },
            metadata: {
              proposalId: link.proposalId,
              reviewerEmail,
              ipAddress: context.ipAddress,
              decisionId: decision.id,
            },
          },
        });
        return {
          accepted: true,
          type: decision.type,
          status: nextStatus,
          createdAt: decision.createdAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findOwnedLink(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.titleReviewLink.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!link) throw new NotFoundException('Enlace no encontrado.');
    this.assertClientPermission(principal, link.clientId);
    return link;
  }

  private async findActive(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new NotFoundException('Enlace de revisión no válido.');
    }
    const link = await this.prisma.titleReviewLink.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        client: { select: { name: true, slug: true } },
        proposal: { select: { currentVersion: true, status: true } },
      },
    });
    if (!link) throw new NotFoundException('Enlace de revisión no válido.');
    if (
      link.status !== ClientReviewLinkStatus.ACTIVE ||
      link.expiresAt <= new Date() ||
      link.viewCount >= link.maxViews ||
      link.proposal.currentVersion !== link.version ||
      !reviewableStatuses.includes(link.proposal.status)
    ) {
      if (link.status === ClientReviewLinkStatus.ACTIVE) {
        await this.prisma.titleReviewLink.update({
          where: { id: link.id },
          data: { status: ClientReviewLinkStatus.EXPIRED },
        });
      }
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    return link;
  }

  private async assertSenderEmail(
    principal: AuthPrincipal,
    senderEmail: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { email: true },
    });
    if (user?.email && user.email.toLowerCase() !== senderEmail) {
      throw new ForbiddenException(
        'El remitente debe coincidir con el correo corporativo de tu cuenta.',
      );
    }
  }

  private hashToken(token: string) {
    return hashReviewToken(token);
  }

  private publicWebUrl() {
    return this.config.getOrThrow<string>('PUBLIC_WEB_URL').replace(/\/$/, '');
  }

  private reviewTokenSecret() {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private assertCanRecover(link: {
    status: ClientReviewLinkStatus;
    expiresAt: Date;
    viewCount: number;
    maxViews: number;
  }) {
    if (
      link.status !== ClientReviewLinkStatus.ACTIVE ||
      link.expiresAt <= new Date() ||
      link.viewCount >= link.maxViews
    ) {
      throw new ConflictException(
        'Solo se puede recuperar una invitación activa y vigente.',
      );
    }
  }

  private emailHint(email: string) {
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;
    return `${local.slice(0, 1)}***@${domain}`;
  }

  private assertClientPermission(principal: AuthPrincipal, clientId: string) {
    if (!hasPermission(principal, 'review_links.manage', clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }
}
