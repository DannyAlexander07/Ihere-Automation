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
  AuditActorType,
  ClientReviewDecisionType,
  ClientReviewLinkStatus,
  NoteImageStatus,
  NoteStatus,
  Prisma,
} from '../generated/prisma/client';
import type { CreateNotePackageReviewLinkDto } from './dto/create-note-package-review-link.dto';
import type { NotePackageReviewDecisionDto } from './dto/note-package-review-decision.dto';
import type { ReviewDispatchDto } from './dto/review-dispatch.dto';
import { buildNotePackageReviewUrl } from './note-package-review-url';
import {
  createRecoverableReviewCredentials,
  hashReviewToken,
  isRecoverableReviewToken,
  recoverableReviewToken,
} from './recoverable-review-token';

@Injectable()
export class NotePackageReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    generationRunId: string,
    input: CreateNotePackageReviewLinkDto,
    principal: AuthPrincipal,
  ) {
    if (new Set(input.noteIds).size !== input.noteIds.length) {
      throw new ConflictException('La selección contiene notas repetidas.');
    }
    const run = await this.prisma.aiGenerationRun.findFirst({
      where: {
        id: generationRunId,
        tenantId: principal.tenantId,
        kind: AiGenerationKind.TITLE_PROPOSALS,
      },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        inputSnapshot: true,
        createdAt: true,
      },
    });
    if (!run) throw new NotFoundException('Expediente de notas no encontrado.');
    this.assertClientPermission(principal, run.clientId);
    const notes = await this.prisma.noteDocument.findMany({
      where: {
        id: { in: input.noteIds },
        tenantId: principal.tenantId,
        clientId: run.clientId,
        status: NoteStatus.READY_FOR_REVIEW,
        titleProposal: { generationRunId: run.id },
      },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        imageProposals: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (notes.length !== input.noteIds.length) {
      throw new ConflictException(
        'Todas las notas deben pertenecer al expediente y estar listas para revisión.',
      );
    }
    const credentials = createRecoverableReviewCredentials(
      'note-package',
      this.reviewTokenSecret(),
    );
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const created = await this.prisma.$transaction(
      async (tx) => {
        await tx.notePackageReviewLink.updateMany({
          where: {
            generationRunId: run.id,
            status: ClientReviewLinkStatus.ACTIVE,
          },
          data: {
            status: ClientReviewLinkStatus.REVOKED,
            revokedById: principal.userId,
            revokedAt: new Date(),
          },
        });
        for (const note of notes) {
          const version = note.versions[0];
          if (!version) {
            throw new ConflictException('Una nota no tiene versión revisable.');
          }
          if (
            !note.imageProposals.some(
              (item) => item.version === version.version,
            )
          ) {
            await tx.noteImageProposal.create({
              data: this.defaultImageProposal(note, version, principal.userId),
            });
          }
        }
        const link = await tx.notePackageReviewLink.create({
          data: {
            id: credentials.id,
            tenantId: run.tenantId,
            clientId: run.clientId,
            generationRunId: run.id,
            tokenHash: credentials.tokenHash,
            recipientName: input.recipientName.trim(),
            recipientEmail: input.recipientEmail.trim().toLowerCase(),
            expiresAt,
            createdById: principal.userId,
            items: {
              create: notes.map((note, position) => ({
                noteId: note.id,
                version: note.currentVersion,
                position,
              })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: run.tenantId,
            clientId: run.clientId,
            userId: principal.userId,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            actorType: AuditActorType.USER,
            action: 'note_package_review.link.created',
            entityType: 'note_package_review_link',
            entityId: link.id,
            after: {
              generationRunId: run.id,
              notes: notes.map((note) => ({
                noteId: note.id,
                version: note.currentVersion,
              })),
              expiresAt: expiresAt.toISOString(),
            },
            metadata: { recipientEmail: link.recipientEmail },
          },
        });
        return link;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      id: created.id,
      reviewUrl: buildNotePackageReviewUrl(
        this.publicWebUrl(),
        credentials.token,
      ),
      expiresAt,
      status: created.status,
      noteCount: notes.length,
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
    if (!run) throw new NotFoundException('Expediente de notas no encontrado.');
    this.assertClientPermission(principal, run.clientId);
    const links = await this.prisma.notePackageReviewLink.findMany({
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
        lastViewedAt: true,
        sentByEmail: true,
        emailSubject: true,
        externalMessageId: true,
        sentAt: true,
        createdAt: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            noteId: true,
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
    const secret = this.reviewTokenSecret();
    return links.map(({ tokenHash, items, ...link }) => ({
      ...link,
      reviewUrl:
        link.status === ClientReviewLinkStatus.ACTIVE &&
        link.expiresAt > new Date() &&
        isRecoverableReviewToken('note-package', link.id, tokenHash, secret)
          ? buildNotePackageReviewUrl(
              this.publicWebUrl(),
              recoverableReviewToken('note-package', link.id, secret),
            )
          : null,
      noteCount: items.length,
      decisions: items.flatMap((item) =>
        item.decision
          ? [{ noteId: item.noteId, version: item.version, ...item.decision }]
          : [],
      ),
    }));
  }

  async recoverAccess(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    this.assertCanRecover(link);
    const token = recoverableReviewToken(
      'note-package',
      link.id,
      this.reviewTokenSecret(),
    );
    await this.prisma.$transaction([
      this.prisma.notePackageReviewLink.update({
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
          action: 'note_package_review.link.access_recovered',
          entityType: 'note_package_review_link',
          entityId: link.id,
          metadata: { generationRunId: link.generationRunId },
        },
      }),
    ]);
    return {
      id: link.id,
      reviewUrl: buildNotePackageReviewUrl(this.publicWebUrl(), token),
      expiresAt: link.expiresAt,
      status: link.status,
    };
  }

  async revoke(id: string, principal: AuthPrincipal) {
    const link = await this.findOwnedLink(id, principal);
    if (link.status !== ClientReviewLinkStatus.ACTIVE) {
      throw new ConflictException('El enlace ya no está activo.');
    }
    return this.prisma.notePackageReviewLink.update({
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
      const updated = await tx.notePackageReviewLink.update({
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
          action: 'note_package_review.email.sent_confirmed',
          entityType: 'note_package_review_link',
          entityId: id,
          after: { senderEmail, subject: input.subject.trim(), sentAt },
          metadata: { recipientEmail: link.recipientEmail },
        },
      });
      return updated;
    });
  }

  async publicView(token: string) {
    const link = await this.findActive(token);
    const claimed = await this.prisma.notePackageReviewLink.updateMany({
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
    const versions = await this.prisma.noteVersion.findMany({
      where: {
        OR: link.items.map((item) => ({
          noteId: item.noteId,
          version: item.version,
        })),
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
    });
    const images = await this.prisma.noteImageProposal.findMany({
      where: {
        OR: link.items.map((item) => ({
          noteId: item.noteId,
          version: item.version,
        })),
      },
      select: {
        noteId: true,
        version: true,
        concept: true,
        prompt: true,
        altText: true,
        caption: true,
        referenceUrl: true,
        status: true,
      },
    });
    const byVersion = new Map(
      versions.map((version) => [
        `${version.noteId}:${version.version}`,
        version,
      ]),
    );
    const imageByVersion = new Map(
      images.map((image) => [`${image.noteId}:${image.version}`, image]),
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
      notes: link.items.map((item) => {
        const version = byVersion.get(`${item.noteId}:${item.version}`)!;
        return {
          noteId: item.noteId,
          version: item.version,
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
            image: imageByVersion.get(`${item.noteId}:${item.version}`) ?? null,
          },
        };
      }),
    };
  }

  async decide(
    token: string,
    input: NotePackageReviewDecisionDto,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const link = await this.findActive(token);
    const reviewerEmail = input.reviewerEmail.trim().toLowerCase();
    if (reviewerEmail !== link.recipientEmail) {
      throw new ForbiddenException(
        'El correo no coincide con el destinatario autorizado.',
      );
    }
    const byNote = new Map(input.decisions.map((item) => [item.noteId, item]));
    const invalid =
      byNote.size !== input.decisions.length ||
      input.decisions.length !== link.items.length ||
      link.items.some((item) => {
        const decision = byNote.get(item.noteId);
        return !decision || decision.version !== item.version;
      });
    if (invalid) {
      throw new ConflictException(
        'Debes registrar una sola decisión vigente para cada nota del paquete.',
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        const completedAt = new Date();
        const claimed = await tx.notePackageReviewLink.updateMany({
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
          noteId: string;
          version: number;
          type: ClientReviewDecisionType;
          status: NoteStatus;
        }> = [];
        for (const item of link.items) {
          const decision = byNote.get(item.noteId)!;
          const status = this.statusForDecision(decision.type);
          const updated = await tx.noteDocument.updateMany({
            where: {
              id: item.noteId,
              currentVersion: item.version,
              status: NoteStatus.READY_FOR_REVIEW,
            },
            data: {
              status,
              approvedAt:
                decision.type === ClientReviewDecisionType.APPROVE
                  ? completedAt
                  : null,
              approvedById: null,
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Una nota cambió antes de registrar la revisión.',
            );
          }
          await tx.notePackageReviewDecision.create({
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
          await tx.noteImageProposal.updateMany({
            where: { noteId: item.noteId, version: item.version },
            data: {
              status:
                decision.type === ClientReviewDecisionType.APPROVE
                  ? NoteImageStatus.APPROVED
                  : decision.type === ClientReviewDecisionType.REJECT
                    ? NoteImageStatus.REJECTED
                    : NoteImageStatus.CHANGES_REQUESTED,
              decisionReason:
                decision.reason?.trim() || 'Aprobada junto con la nota.',
              approvedAt:
                decision.type === ClientReviewDecisionType.APPROVE
                  ? completedAt
                  : null,
              approvedById: null,
            },
          });
          results.push({
            noteId: item.noteId,
            version: item.version,
            type: decision.type,
            status,
          });
        }
        await tx.clientReviewLink.updateMany({
          where: {
            noteId: { in: link.items.map((item) => item.noteId) },
            status: ClientReviewLinkStatus.ACTIVE,
          },
          data: {
            status: ClientReviewLinkStatus.REVOKED,
            revokedAt: new Date(),
          },
        });
        await tx.notePackageReviewLink.updateMany({
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
            action: 'note_package_review.decision.completed',
            entityType: 'note_package_review_link',
            entityId: link.id,
            before: { status: ClientReviewLinkStatus.ACTIVE },
            after: {
              status: ClientReviewLinkStatus.COMPLETED,
              decisions: results,
            },
            metadata: { reviewerEmail, ipAddress: context.ipAddress },
          },
        });
        return { accepted: true, completedAt, decisions: results };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findOwnedLink(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.notePackageReviewLink.findFirst({
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
    const link = await this.prisma.notePackageReviewLink.findUnique({
      where: { tokenHash: hashReviewToken(token) },
      include: {
        client: { select: { name: true, slug: true } },
        generationRun: { select: { inputSnapshot: true, createdAt: true } },
        items: {
          orderBy: { position: 'asc' },
          include: {
            note: { select: { currentVersion: true, status: true } },
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Enlace de revisión no válido.');
    const stale = link.items.some(
      (item) =>
        item.note.currentVersion !== item.version ||
        item.note.status !== NoteStatus.READY_FOR_REVIEW,
    );
    if (
      link.status !== ClientReviewLinkStatus.ACTIVE ||
      link.expiresAt <= new Date() ||
      link.viewCount >= link.maxViews ||
      !link.items.length ||
      stale
    ) {
      if (link.status === ClientReviewLinkStatus.ACTIVE) {
        await this.prisma.notePackageReviewLink.updateMany({
          where: { id: link.id, status: ClientReviewLinkStatus.ACTIVE },
          data: { status: ClientReviewLinkStatus.EXPIRED },
        });
      }
      throw new GoneException('El enlace de revisión ya no está disponible.');
    }
    return link;
  }

  private defaultImageProposal(
    note: { id: string; tenantId: string; clientId: string },
    version: { version: number; title: string; excerpt: string | null },
    userId: string,
  ) {
    const context = version.excerpt?.trim() || version.title;
    return {
      tenantId: note.tenantId,
      clientId: note.clientId,
      noteId: note.id,
      version: version.version,
      concept: `Escena editorial auténtica que represente “${version.title}” en un contexto laboral peruano.`,
      prompt: `Fotografía editorial profesional y humana para Adecco Perú sobre ${context}. Personas reales en un entorno laboral peruano, composición natural, luz clara, diversidad auténtica, sin logotipos inventados, sin texto incrustado y sin estética de banco genérico.`,
      altText: `Escena laboral relacionada con ${version.title}`.slice(0, 320),
      caption: null,
      referenceUrl: null,
      createdById: userId,
    };
  }

  private statusForDecision(type: ClientReviewDecisionType) {
    return type === ClientReviewDecisionType.APPROVE
      ? NoteStatus.APPROVED
      : type === ClientReviewDecisionType.REJECT
        ? NoteStatus.REJECTED
        : NoteStatus.CHANGES_REQUESTED;
  }

  private packageTopic(snapshot: Prisma.JsonValue) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return 'Paquete mensual de notas';
    }
    const request = (snapshot as Record<string, unknown>).request;
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return 'Paquete mensual de notas';
    }
    const topic = (request as Record<string, unknown>).topic;
    return typeof topic === 'string' && topic.trim()
      ? topic.trim()
      : 'Paquete mensual de notas';
  }

  private emailHint(email: string) {
    const [local, domain] = email.split('@');
    return local && domain ? `${local.slice(0, 1)}***@${domain}` : null;
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

  private assertClientPermission(principal: AuthPrincipal, clientId: string) {
    if (!hasPermission(principal, 'review_links.manage', clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }

  private publicWebUrl() {
    return this.config.getOrThrow<string>('PUBLIC_WEB_URL').replace(/\/$/, '');
  }

  private reviewTokenSecret() {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
}
