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
import { PrismaService } from '../database/prisma.service';
import {
  AiGenerationKind,
  AiGenerationStatus,
  AuditActorType,
  ClientReviewDecisionType,
  ClientReviewLinkStatus,
  CorrectionType,
  Prisma,
  TitleDecisionType,
  TitleStatus,
} from '../generated/prisma/client';
import { TitleWorkflowService } from '../titles/title-workflow.service';
import type { CreateTitlePackageReviewLinkDto } from './dto/create-title-package-review-link.dto';
import type { ReviewDispatchDto } from './dto/review-dispatch.dto';
import type { TitlePackageReviewDecisionDto } from './dto/title-package-review-decision.dto';
import {
  createRecoverableReviewCredentials,
  hashReviewToken,
  isRecoverableReviewToken,
  recoverableReviewToken,
} from './recoverable-review-token';
import { buildTitlePackageReviewUrl } from './title-package-review-url';

const reviewableStatuses: TitleStatus[] = [
  TitleStatus.PROPOSED,
  TitleStatus.EVALUATING,
];
const monthlyApprovalTarget = 4;

@Injectable()
export class TitlePackageReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workflow: TitleWorkflowService,
  ) {}

  async create(
    generationRunId: string,
    input: CreateTitlePackageReviewLinkDto,
    principal: AuthPrincipal,
  ) {
    const run = await this.prisma.aiGenerationRun.findFirst({
      where: {
        id: generationRunId,
        tenantId: principal.tenantId,
        kind: AiGenerationKind.TITLE_PROPOSALS,
      },
      include: {
        titleProposals: {
          orderBy: { createdAt: 'asc' },
          include: {
            evaluations: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Paquete de títulos no encontrado.');
    this.assertClientPermission(principal, run.clientId);
    if (run.status !== AiGenerationStatus.COMPLETED) {
      throw new ConflictException(
        'El paquete debe terminar su preparación antes de compartirlo.',
      );
    }
    if (!run.titleProposals.length) {
      throw new ConflictException('El paquete no contiene títulos.');
    }
    const requestedIds = input.proposalIds ? new Set(input.proposalIds) : null;
    if (requestedIds && requestedIds.size !== input.proposalIds?.length) {
      throw new ConflictException('La selección contiene títulos repetidos.');
    }
    const proposals = requestedIds
      ? run.titleProposals.filter((proposal) => requestedIds.has(proposal.id))
      : run.titleProposals;
    if (
      !proposals.length ||
      (requestedIds && proposals.length !== requestedIds.size)
    ) {
      throw new ConflictException(
        'Uno o más títulos seleccionados no pertenecen a este paquete.',
      );
    }
    for (const proposal of proposals) {
      this.workflow.assertCanDecide(
        proposal.status,
        TitleDecisionType.APPROVE,
        proposal.duplicateScore,
        proposal.duplicateResolution,
        proposal.evaluations[0],
      );
    }
    const selectedProposalIds = new Set(
      proposals.map((proposal) => proposal.id),
    );
    const approvedOutsideSelection = run.titleProposals.filter(
      (proposal) =>
        proposal.status === TitleStatus.APPROVED &&
        !selectedProposalIds.has(proposal.id),
    ).length;
    const remainingApprovals = monthlyApprovalTarget - approvedOutsideSelection;
    if (remainingApprovals <= 0) {
      throw new ConflictException(
        'El expediente ya cuenta con cuatro títulos aprobados para el mes.',
      );
    }
    const approvalTarget = Math.min(proposals.length, remainingApprovals);

    const credentials = createRecoverableReviewCredentials(
      'title-package',
      this.reviewTokenSecret(),
    );
    const token = credentials.token;
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const link = await this.prisma.$transaction(
      async (tx) => {
        await tx.titlePackageReviewLink.updateMany({
          where: {
            generationRunId,
            status: ClientReviewLinkStatus.ACTIVE,
          },
          data: {
            status: ClientReviewLinkStatus.REVOKED,
            revokedById: principal.userId,
            revokedAt: new Date(),
          },
        });
        const created = await tx.titlePackageReviewLink.create({
          data: {
            id: credentials.id,
            tenantId: principal.tenantId,
            clientId: run.clientId,
            generationRunId,
            tokenHash: credentials.tokenHash,
            recipientName: input.recipientName.trim(),
            recipientEmail: input.recipientEmail.trim().toLowerCase(),
            expiresAt,
            approvalTarget,
            createdById: principal.userId,
            items: {
              create: proposals.map((proposal, position) => ({
                proposalId: proposal.id,
                version: proposal.currentVersion,
                position,
              })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: run.clientId,
            userId: principal.userId,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            actorType: AuditActorType.USER,
            action: 'title_package_review.link.created',
            entityType: 'title_package_review_link',
            entityId: created.id,
            after: {
              generationRunId,
              titleCount: proposals.length,
              approvalTarget,
              partialCorrection: proposals.length !== run.titleProposals.length,
              versions: proposals.map((proposal) => ({
                proposalId: proposal.id,
                version: proposal.currentVersion,
              })),
              expiresAt: expiresAt.toISOString(),
            },
            metadata: { recipientEmail: created.recipientEmail },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const baseUrl = this.config
      .getOrThrow<string>('PUBLIC_WEB_URL')
      .replace(/\/$/, '');
    return {
      id: link.id,
      reviewUrl: buildTitlePackageReviewUrl(baseUrl, token),
      expiresAt,
      status: link.status,
      titleCount: proposals.length,
      approvalTarget,
    };
  }

  async list(generationRunId: string, principal: AuthPrincipal) {
    const run = await this.prisma.aiGenerationRun.findFirst({
      where: {
        id: generationRunId,
        tenantId: principal.tenantId,
        kind: AiGenerationKind.TITLE_PROPOSALS,
      },
      select: { clientId: true },
    });
    if (!run) throw new NotFoundException('Paquete de títulos no encontrado.');
    this.assertClientPermission(principal, run.clientId);
    const links = await this.prisma.titlePackageReviewLink.findMany({
      where: { generationRunId, tenantId: principal.tenantId },
      select: {
        id: true,
        tokenHash: true,
        status: true,
        recipientName: true,
        recipientEmail: true,
        expiresAt: true,
        viewCount: true,
        maxViews: true,
        approvalTarget: true,
        lastViewedAt: true,
        sentByEmail: true,
        emailSubject: true,
        externalMessageId: true,
        sentAt: true,
        createdAt: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            proposalId: true,
            version: true,
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const baseUrl = this.publicWebUrl();
    const secret = this.reviewTokenSecret();
    return links.map(({ items, tokenHash, ...link }) => ({
      ...link,
      reviewUrl:
        link.status === ClientReviewLinkStatus.ACTIVE &&
        link.expiresAt > new Date() &&
        isRecoverableReviewToken('title-package', link.id, tokenHash, secret)
          ? buildTitlePackageReviewUrl(
              baseUrl,
              recoverableReviewToken('title-package', link.id, secret),
            )
          : null,
      titleCount: items.length,
      decisions: items.flatMap((item) =>
        item.decision
          ? [
              {
                proposalId: item.proposalId,
                version: item.version,
                ...item.decision,
              },
            ]
          : [],
      ),
    }));
  }

  async recoverAccess(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    this.assertCanRecover(link);
    const token = recoverableReviewToken(
      'title-package',
      link.id,
      this.reviewTokenSecret(),
    );
    await this.prisma.$transaction([
      this.prisma.titlePackageReviewLink.update({
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
          action: 'title_package_review.link.access_recovered',
          entityType: 'title_package_review_link',
          entityId: link.id,
          metadata: { generationRunId: link.generationRunId },
        },
      }),
    ]);
    return {
      id: link.id,
      reviewUrl: buildTitlePackageReviewUrl(this.publicWebUrl(), token),
      expiresAt: link.expiresAt,
      status: link.status,
    };
  }

  async revoke(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    if (link.status !== ClientReviewLinkStatus.ACTIVE) {
      throw new ConflictException('El enlace ya no está activo.');
    }
    return this.prisma.titlePackageReviewLink.update({
      where: { id },
      data: {
        status: ClientReviewLinkStatus.REVOKED,
        revokedById: principal.userId,
        revokedAt: new Date(),
      },
      select: { id: true, status: true, revokedAt: true },
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
      const updated = await tx.titlePackageReviewLink.update({
        where: { id },
        data: {
          sentByEmail: senderEmail,
          emailSubject: input.subject.trim(),
          externalMessageId: input.externalMessageId?.trim() || null,
          sentAt,
        },
        select: {
          id: true,
          status: true,
          sentByEmail: true,
          emailSubject: true,
          externalMessageId: true,
          sentAt: true,
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
          action: 'title_package_review.email.sent_confirmed',
          entityType: 'title_package_review_link',
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
    const claimed = await this.prisma.titlePackageReviewLink.updateMany({
      where: {
        id: link.id,
        status: ClientReviewLinkStatus.ACTIVE,
        viewCount: { lt: link.maxViews },
        expiresAt: { gt: new Date() },
      },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    const versions = await this.prisma.titleVersion.findMany({
      where: {
        OR: link.items.map((item) => ({
          proposalId: item.proposalId,
          version: item.version,
        })),
      },
    });
    const byProposal = new Map(
      versions.map((version) => [
        `${version.proposalId}:${version.version}`,
        version,
      ]),
    );
    if (versions.length !== link.items.length) {
      throw new GoneException('El paquete compartido ya no está disponible.');
    }
    return {
      client: link.client,
      generationRunId: link.generationRunId,
      topic: this.packageTopic(link.generationRun.inputSnapshot),
      createdAt: link.generationRun.createdAt,
      expiresAt: link.expiresAt,
      recipientName: link.recipientName,
      recipientEmailHint: this.emailHint(link.recipientEmail),
      approvalTarget: link.approvalTarget,
      titles: link.items.map((item) => {
        const version = byProposal.get(`${item.proposalId}:${item.version}`)!;
        return {
          proposalId: item.proposalId,
          version: item.version,
          content: {
            service: version.service,
            title: version.title,
            objective: version.objective,
            audience: version.audience,
            searchIntent: version.searchIntent,
            focus: version.focus,
            opportunity: version.opportunity,
            risk: version.risk,
          },
        };
      }),
    };
  }

  async decide(
    token: string,
    input: TitlePackageReviewDecisionDto,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const link = await this.findActive(token);
    const reviewerEmail = input.reviewerEmail.trim().toLowerCase();
    if (reviewerEmail !== link.recipientEmail) {
      throw new ForbiddenException(
        'El correo no coincide con el destinatario autorizado.',
      );
    }
    const decisionsByProposal = new Map(
      input.decisions.map((decision) => [decision.proposalId, decision]),
    );
    if (
      decisionsByProposal.size !== input.decisions.length ||
      input.decisions.some((submitted) => {
        const item = link.items.find(
          (candidate) => candidate.proposalId === submitted.proposalId,
        );
        return !item || submitted.version !== item.version;
      })
    ) {
      throw new ConflictException(
        'La revisión contiene títulos repetidos, ajenos al paquete o desactualizados.',
      );
    }
    const approvalCount = input.decisions.filter(
      (decision) => decision.type === ClientReviewDecisionType.APPROVE,
    ).length;
    const allReviewed = input.decisions.length === link.items.length;
    if (approvalCount > link.approvalTarget) {
      throw new ConflictException(
        `Solo puedes aprobar ${link.approvalTarget} títulos en este paquete.`,
      );
    }
    if (approvalCount < link.approvalTarget && !allReviewed) {
      throw new ConflictException(
        `Aprueba ${link.approvalTarget} títulos o registra una decisión para cada alternativa antes de enviar.`,
      );
    }
    if (
      allReviewed &&
      link.items.some((item) => {
        const decision = decisionsByProposal.get(item.proposalId);
        return !decision || decision.version !== item.version;
      })
    ) {
      throw new ConflictException(
        'Debes registrar una sola decisión para cada título revisado.',
      );
    }
    const targetReached = approvalCount === link.approvalTarget;

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.titlePackageReviewLink.updateMany({
          where: {
            id: link.id,
            status: ClientReviewLinkStatus.ACTIVE,
            expiresAt: { gt: new Date() },
          },
          data: { status: ClientReviewLinkStatus.COMPLETED },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('La revisión ya fue respondida.');
        }

        const results: Array<{
          proposalId: string;
          type: ClientReviewDecisionType | 'NOT_SELECTED';
          status: TitleStatus;
        }> = [];
        for (const item of link.items) {
          const decision = decisionsByProposal.get(item.proposalId);
          const selectedForDevelopment =
            decision?.type === ClientReviewDecisionType.APPROVE;
          const nextStatus = selectedForDevelopment
            ? TitleStatus.APPROVED
            : targetReached
              ? TitleStatus.ARCHIVED
              : this.statusForDecision(decision!.type);
          const proposalClaimed = await tx.titleProposal.updateMany({
            where: {
              id: item.proposalId,
              generationRunId: link.generationRunId,
              currentVersion: item.version,
              status: { in: reviewableStatuses },
            },
            data: {
              status: nextStatus,
              approvedAt: selectedForDevelopment ? new Date() : null,
              approvedById: null,
            },
          });
          if (proposalClaimed.count !== 1) {
            throw new ConflictException(
              'Uno de los títulos cambió antes de registrar la revisión.',
            );
          }
          if (decision) {
            await tx.titlePackageReviewDecision.create({
              data: {
                itemId: item.id,
                type: decision.type,
                reason: decision.reason?.trim() || 'Aprobado por el cliente.',
                reviewerName: link.recipientName,
                reviewerEmail,
                ipAddress: context.ipAddress?.slice(0, 64),
                userAgent: context.userAgent?.slice(0, 500),
              },
            });
            if (decision.type !== ClientReviewDecisionType.APPROVE) {
              const reviewedVersion = await tx.titleVersion.findUniqueOrThrow({
                where: {
                  proposalId_version: {
                    proposalId: item.proposalId,
                    version: item.version,
                  },
                },
                select: { id: true, title: true },
              });
              const reason = decision.reason?.trim() || 'Revisión del cliente.';
              await tx.correctionSignal.create({
                data: {
                  tenantId: link.tenantId,
                  clientId: link.clientId,
                  proposalId: item.proposalId,
                  versionId: reviewedVersion.id,
                  field: 'client.title_feedback',
                  beforeValue: reviewedVersion.title,
                  afterValue: reason,
                  reason,
                  correctionType: CorrectionType.OTHER,
                  actorId: link.createdById,
                },
              });
            }
          }
          results.push({
            proposalId: item.proposalId,
            type: decision?.type ?? 'NOT_SELECTED',
            status: nextStatus,
          });
        }

        await tx.titleReviewLink.updateMany({
          where: {
            proposalId: { in: link.items.map((item) => item.proposalId) },
            status: ClientReviewLinkStatus.ACTIVE,
          },
          data: {
            status: ClientReviewLinkStatus.REVOKED,
            revokedAt: new Date(),
          },
        });
        await tx.titlePackageReviewLink.updateMany({
          where: {
            generationRunId: link.generationRunId,
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
            action: 'title_package_review.decision.completed',
            entityType: 'title_package_review_link',
            entityId: link.id,
            before: { status: ClientReviewLinkStatus.ACTIVE },
            after: {
              status: ClientReviewLinkStatus.COMPLETED,
              decisions: results,
            },
            metadata: {
              generationRunId: link.generationRunId,
              reviewerEmail,
              ipAddress: context.ipAddress,
            },
          },
        });
        return {
          accepted: true,
          completedAt: new Date(),
          decisions: results,
          approvalTarget: link.approvalTarget,
          notSelectedCount: results.filter(
            (result) => result.status === TitleStatus.ARCHIVED,
          ).length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findOwnedLink(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.titlePackageReviewLink.findFirst({
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
    const link = await this.prisma.titlePackageReviewLink.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        client: { select: { name: true, slug: true } },
        generationRun: { select: { inputSnapshot: true, createdAt: true } },
        items: {
          orderBy: { position: 'asc' },
          include: {
            proposal: {
              select: { currentVersion: true, status: true },
            },
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Enlace de revisión no válido.');
    const stale = link.items.some(
      (item) =>
        item.proposal.currentVersion !== item.version ||
        !reviewableStatuses.includes(item.proposal.status),
    );
    if (
      link.status !== ClientReviewLinkStatus.ACTIVE ||
      link.expiresAt <= new Date() ||
      link.viewCount >= link.maxViews ||
      !link.items.length ||
      stale
    ) {
      if (link.status === ClientReviewLinkStatus.ACTIVE) {
        await this.prisma.titlePackageReviewLink.updateMany({
          where: { id: link.id, status: ClientReviewLinkStatus.ACTIVE },
          data: { status: ClientReviewLinkStatus.EXPIRED },
        });
      }
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    return link;
  }

  private statusForDecision(type: ClientReviewDecisionType) {
    return type === ClientReviewDecisionType.APPROVE
      ? TitleStatus.APPROVED
      : type === ClientReviewDecisionType.REJECT
        ? TitleStatus.REJECTED
        : TitleStatus.CHANGES_REQUESTED;
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

  private packageTopic(snapshot: Prisma.JsonValue) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return 'Paquete de propuestas editoriales';
    }
    const request = (snapshot as Record<string, unknown>).request;
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return 'Paquete de propuestas editoriales';
    }
    const topic = (request as Record<string, unknown>).topic;
    return typeof topic === 'string' && topic.trim()
      ? topic.trim()
      : 'Paquete de propuestas editoriales';
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
