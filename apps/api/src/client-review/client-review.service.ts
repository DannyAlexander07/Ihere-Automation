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
  CorrectionType,
  NoteImageStatus,
  NoteStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateReviewLinkDto } from './dto/create-review-link.dto';
import type { ClientReviewDecisionDto } from './dto/client-review-decision.dto';
import type { ReviewDispatchDto } from './dto/review-dispatch.dto';
import {
  createRecoverableReviewCredentials,
  hashReviewToken,
  isRecoverableReviewToken,
  recoverableReviewToken,
} from './recoverable-review-token';
import { buildReviewUrl } from './review-url';

@Injectable()
export class ClientReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    noteId: string,
    input: CreateReviewLinkDto,
    principal: AuthPrincipal,
  ) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id: noteId, tenantId: principal.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(
      principal,
      'review_links.manage',
      note.clientId,
    );
    if (note.status !== NoteStatus.READY_FOR_REVIEW) {
      throw new ConflictException(
        'Solo una nota lista para revisión puede compartirse con el cliente.',
      );
    }
    if (!note.versions[0])
      throw new ConflictException('La nota no tiene una versión revisable.');
    const credentials = createRecoverableReviewCredentials(
      'note',
      this.reviewTokenSecret(),
    );
    const token = credentials.token;
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const link = await this.prisma.$transaction(async (tx) => {
      await tx.clientReviewLink.updateMany({
        where: {
          noteId,
          status: ClientReviewLinkStatus.ACTIVE,
        },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedById: principal.userId,
          revokedAt: new Date(),
        },
      });
      const created = await tx.clientReviewLink.create({
        data: {
          id: credentials.id,
          tenantId: principal.tenantId,
          clientId: note.clientId,
          noteId,
          version: note.currentVersion,
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
          clientId: note.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action: 'client_review.link.created',
          entityType: 'client_review_link',
          entityId: created.id,
          after: {
            noteId,
            version: note.currentVersion,
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
      reviewUrl: buildReviewUrl(baseUrl, token),
      expiresAt,
      status: link.status,
    };
  }

  async list(noteId: string, principal: AuthPrincipal) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id: noteId, tenantId: principal.tenantId },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(
      principal,
      'review_links.manage',
      note.clientId,
    );
    const links = await this.prisma.clientReviewLink.findMany({
      where: { noteId, tenantId: principal.tenantId },
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
        isRecoverableReviewToken('note', link.id, tokenHash, secret)
          ? buildReviewUrl(
              baseUrl,
              recoverableReviewToken('note', link.id, secret),
            )
          : null,
    }));
  }

  async recoverAccess(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.clientReviewLink.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!link) throw new NotFoundException('Enlace no encontrado.');
    this.assertClientPermission(
      principal,
      'review_links.manage',
      link.clientId,
    );
    this.assertCanRecover(link);
    const token = recoverableReviewToken(
      'note',
      link.id,
      this.reviewTokenSecret(),
    );
    await this.prisma.$transaction([
      this.prisma.clientReviewLink.update({
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
          action: 'client_review.link.access_recovered',
          entityType: 'client_review_link',
          entityId: link.id,
          metadata: { noteId: link.noteId, version: link.version },
        },
      }),
    ]);
    return {
      id: link.id,
      reviewUrl: buildReviewUrl(this.publicWebUrl(), token),
      expiresAt: link.expiresAt,
      status: link.status,
    };
  }

  async revoke(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.clientReviewLink.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!link) throw new NotFoundException('Enlace no encontrado.');
    this.assertClientPermission(
      principal,
      'review_links.manage',
      link.clientId,
    );
    if (link.status !== ClientReviewLinkStatus.ACTIVE)
      throw new ConflictException('El enlace ya no está activo.');
    return this.prisma.clientReviewLink.update({
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
    const link = await this.prisma.clientReviewLink.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!link) throw new NotFoundException('Enlace no encontrado.');
    this.assertClientPermission(
      principal,
      'review_links.manage',
      link.clientId,
    );
    if (link.status !== ClientReviewLinkStatus.ACTIVE) {
      throw new ConflictException(
        'Solo un enlace activo puede registrarse como enviado.',
      );
    }
    const senderEmail = input.senderEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { email: true },
    });
    if (user?.email && user.email.toLowerCase() !== senderEmail) {
      throw new ForbiddenException(
        'El remitente debe coincidir con el correo corporativo de tu cuenta.',
      );
    }
    const sentAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clientReviewLink.update({
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
          action: 'client_review.email.sent_confirmed',
          entityType: 'client_review_link',
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
    const claimed = await this.prisma.clientReviewLink.updateMany({
      where: {
        id: link.id,
        status: ClientReviewLinkStatus.ACTIVE,
        viewCount: { lt: link.maxViews },
        expiresAt: { gt: new Date() },
        note: {
          currentVersion: link.version,
          status: NoteStatus.READY_FOR_REVIEW,
        },
      },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new GoneException('El enlace de revisión ya no está disponible.');
    const [version, image] = await Promise.all([
      this.prisma.noteVersion.findUnique({
        where: {
          noteId_version: { noteId: link.noteId, version: link.version },
        },
        include: {
          sources: {
            orderBy: { accessedAt: 'desc' },
            select: {
              type: true,
              title: true,
              entity: true,
              url: true,
              publishedAt: true,
              accessedAt: true,
            },
          },
        },
      }),
      this.prisma.noteImageProposal.findUnique({
        where: {
          noteId_version: { noteId: link.noteId, version: link.version },
        },
        select: {
          concept: true,
          prompt: true,
          altText: true,
          caption: true,
          referenceUrl: true,
          status: true,
        },
      }),
    ]);
    if (!version)
      throw new GoneException('La versión compartida ya no está disponible.');
    return {
      client: link.client,
      noteId: link.noteId,
      version: link.version,
      expiresAt: link.expiresAt,
      recipientName: link.recipientName,
      recipientEmailHint: this.emailHint(link.recipientEmail),
      content: {
        title: version.title,
        metaTitle: version.metaTitle,
        metaDescription: version.metaDescription,
        slug: version.slug,
        excerpt: version.excerpt,
        content: version.content,
        authorName: version.authorName,
        authorRole: version.authorRole,
        ctaText: version.ctaText,
        ctaUrl: version.ctaUrl,
        internalLinks: Array.isArray(version.internalLinks)
          ? version.internalLinks.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        sources: version.sources,
        image,
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
    const recipientEmail = link.recipientEmail;
    const recipientName = link.recipientName;
    if (!recipientEmail || !recipientName || reviewerEmail !== recipientEmail) {
      throw new ForbiddenException(
        'El correo no coincide con el destinatario autorizado.',
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        const decidedAt = new Date();
        const claimed = await tx.clientReviewLink.updateMany({
          where: {
            id: link.id,
            status: ClientReviewLinkStatus.ACTIVE,
            expiresAt: { gt: new Date() },
            note: {
              currentVersion: link.version,
              status: NoteStatus.READY_FOR_REVIEW,
            },
          },
          data: { status: ClientReviewLinkStatus.COMPLETED },
        });
        if (claimed.count !== 1)
          throw new ConflictException('La revisión ya fue respondida.');
        const decision = await tx.clientReviewDecision.create({
          data: {
            linkId: link.id,
            type: input.type,
            reason: input.reason.trim(),
            reviewerName: recipientName,
            reviewerEmail,
            ipAddress: context.ipAddress?.slice(0, 64),
            userAgent: context.userAgent?.slice(0, 500),
          },
        });
        if (input.type !== ClientReviewDecisionType.APPROVE) {
          const reviewedVersion = await tx.noteVersion.findUniqueOrThrow({
            where: {
              noteId_version: {
                noteId: link.noteId,
                version: link.version,
              },
            },
            select: { id: true, title: true },
          });
          await tx.correctionSignal.create({
            data: {
              tenantId: link.tenantId,
              clientId: link.clientId,
              noteId: link.noteId,
              noteVersionId: reviewedVersion.id,
              field: 'client.note_feedback',
              beforeValue: reviewedVersion.title,
              afterValue: input.reason.trim(),
              reason: input.reason.trim(),
              correctionType: CorrectionType.OTHER,
              actorId: link.createdById,
            },
          });
        }
        await tx.noteImageProposal.updateMany({
          where: { noteId: link.noteId, version: link.version },
          data: {
            status:
              input.type === ClientReviewDecisionType.APPROVE
                ? NoteImageStatus.APPROVED
                : input.type === ClientReviewDecisionType.REJECT
                  ? NoteImageStatus.REJECTED
                  : NoteImageStatus.CHANGES_REQUESTED,
            decisionReason: input.reason.trim(),
            approvedAt:
              input.type === ClientReviewDecisionType.APPROVE
                ? decidedAt
                : null,
            approvedById: null,
          },
        });
        const status =
          input.type === ClientReviewDecisionType.APPROVE
            ? NoteStatus.APPROVED
            : input.type === ClientReviewDecisionType.REJECT
              ? NoteStatus.REJECTED
              : NoteStatus.CHANGES_REQUESTED;
        const noteClaimed = await tx.noteDocument.updateMany({
          where: {
            id: link.noteId,
            currentVersion: link.version,
            status: NoteStatus.READY_FOR_REVIEW,
          },
          data: {
            status,
            approvedAt:
              input.type === ClientReviewDecisionType.APPROVE
                ? decidedAt
                : null,
            approvedById: null,
          },
        });
        if (noteClaimed.count !== 1) {
          throw new ConflictException(
            'La nota cambió antes de registrar la decisión.',
          );
        }
        await tx.auditLog.create({
          data: {
            tenantId: link.tenantId,
            clientId: link.clientId,
            actorType: AuditActorType.SERVICE,
            action: `client_review.decision.${input.type.toLowerCase()}`,
            entityType: 'client_review_link',
            entityId: link.id,
            after: {
              noteId: link.noteId,
              version: link.version,
              type: input.type,
            },
            metadata: {
              reviewerEmail: decision.reviewerEmail,
              ipAddress: context.ipAddress,
            },
          },
        });
        return {
          accepted: true,
          type: decision.type,
          status,
          createdAt: decision.createdAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findActive(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new NotFoundException('Enlace de revisión no válido.');
    const link = await this.prisma.clientReviewLink.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        client: { select: { name: true, slug: true } },
        note: { select: { currentVersion: true, status: true } },
      },
    });
    if (!link) throw new NotFoundException('Enlace de revisión no válido.');
    if (
      link.status !== ClientReviewLinkStatus.ACTIVE ||
      link.expiresAt <= new Date() ||
      link.viewCount >= link.maxViews ||
      link.note.currentVersion !== link.version ||
      link.note.status !== NoteStatus.READY_FOR_REVIEW
    ) {
      if (link.status === ClientReviewLinkStatus.ACTIVE) {
        await this.prisma.clientReviewLink.update({
          where: { id: link.id },
          data: { status: ClientReviewLinkStatus.EXPIRED },
        });
      }
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    return link;
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
  private emailHint(email: string | null) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;
    return `${local.slice(0, 1)}***@${domain}`;
  }
  private assertClientPermission(
    principal: AuthPrincipal,
    permission: string,
    clientId: string,
  ) {
    if (!hasPermission(principal, permission, clientId))
      throw new ForbiddenException('No tienes permisos para este cliente.');
  }
}
