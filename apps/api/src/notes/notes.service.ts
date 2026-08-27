import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import {
  clientIdsForPermission,
  hasPermission,
} from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import {
  AuditActorType,
  ClientReviewDecisionType,
  ClientReviewLinkStatus,
  EvaluationStatus,
  EvaluationVerdict,
  NoteDecisionType,
  NoteImageStatus,
  NoteStatus,
  OutboxJobStatus,
  Prisma,
  TitleStatus,
  VersionSource,
} from '../generated/prisma/client';
import { CreateNoteDto } from './dto/create-note.dto';
import { ListNotesDto } from './dto/list-notes.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NoteDecisionDto } from './dto/note-decision.dto';
import { NoteContentService } from './note-content.service';
import { stripTrackedUrlsFromValue } from '../common/url-hygiene';
import { NOTE_QA_JOB } from './note-qa-queue.service';
import { canCreateNoteRevision, canQueueNoteQa } from './note-revision-policy';
import { buildEditorialBriefSnapshot } from './editorial-brief';
import type { UpdateNoteImageProposalDto } from './dto/update-note-image-proposal.dto';
import type { NoteImageDecisionDto } from './dto/note-image-decision.dto';
import { resolveEditorialCta } from './editorial-cta';

const editableVersionFields = [
  'title',
  'metaTitle',
  'metaDescription',
  'slug',
  'excerpt',
  'content',
  'authorName',
  'authorRole',
  'ctaText',
  'ctaUrl',
  'internalLinks',
  'sources',
] as const;

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: NoteContentService,
  ) {}

  async list(query: ListNotesDto, principal: AuthPrincipal) {
    if (query.clientId)
      this.assertClientPermission(principal, 'notes.read', query.clientId);
    const tenantWide = principal.tenantPermissions.includes('notes.read');
    const notes = await this.prisma.noteDocument.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(query.clientId
          ? { clientId: query.clientId }
          : tenantWide
            ? {}
            : {
                clientId: {
                  in: clientIdsForPermission(principal, 'notes.read'),
                },
              }),
        ...(query.status ? { status: query.status } : {}),
      },
      select: {
        id: true,
        clientId: true,
        titleProposalId: true,
        status: true,
        currentVersion: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        client: { select: { name: true, slug: true } },
        titleProposal: {
          select: {
            generationRun: {
              select: {
                id: true,
                campaignYear: true,
                campaignMonth: true,
                campaignTopic: true,
                editorialFolderKey: true,
                createdAt: true,
              },
            },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            title: true,
            metaDescription: true,
            wordCount: true,
            contentHash: true,
            authorName: true,
            _count: { select: { sources: true } },
          },
        },
        qaEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            version: true,
            status: true,
            verdict: true,
            overallScore: true,
            criticalBlockers: true,
            createdAt: true,
          },
        },
        clientReviewLinks: {
          where: {
            status: ClientReviewLinkStatus.COMPLETED,
            decision: { is: { type: ClientReviewDecisionType.APPROVE } },
          },
          select: { version: true },
        },
        notePackageItems: {
          where: {
            link: { status: ClientReviewLinkStatus.COMPLETED },
            decision: { is: { type: ClientReviewDecisionType.APPROVE } },
          },
          select: { version: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return notes.map(({ clientReviewLinks, notePackageItems, ...note }) => ({
      ...note,
      clientApprovedCurrentVersion:
        clientReviewLinks.some(
          (link) => link.version === note.currentVersion,
        ) ||
        notePackageItems.some((item) => item.version === note.currentVersion),
    }));
  }

  async get(id: string, principal: AuthPrincipal) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        titleProposal: {
          select: {
            id: true,
            title: true,
            objective: true,
            audience: true,
            searchIntent: true,
            focus: true,
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          include: { sources: { orderBy: { accessedAt: 'desc' } } },
        },
        decisions: { orderBy: { createdAt: 'desc' } },
        clientReviewLinks: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            createdAt: true,
            decision: {
              select: {
                type: true,
                reason: true,
                reviewerName: true,
                createdAt: true,
              },
            },
          },
        },
        qaEvaluations: {
          orderBy: { createdAt: 'desc' },
          include: { results: { orderBy: { dimension: 'asc' } } },
        },
        exports: { orderBy: { createdAt: 'desc' } },
        imageProposals: { orderBy: { version: 'desc' } },
      },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(principal, 'notes.read', note.clientId);
    return note;
  }

  async create(input: CreateNoteDto, principal: AuthPrincipal) {
    const title = await this.prisma.titleProposal.findFirst({
      where: {
        id: input.titleProposalId,
        tenantId: principal.tenantId,
      },
    });
    if (!title) throw new NotFoundException('Título aprobado no encontrado.');
    this.assertClientPermission(principal, 'notes.create', title.clientId);
    if (title.status !== TitleStatus.APPROVED) {
      throw new ConflictException(
        'Solo un título aprobado puede convertirse en nota.',
      );
    }

    const content = this.content.empty();
    const contentHash = this.content.hash(content);
    const briefSnapshot = buildEditorialBriefSnapshot(title);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const note = await tx.noteDocument.create({
          data: {
            tenantId: principal.tenantId,
            clientId: title.clientId,
            titleProposalId: title.id,
            briefSnapshot,
            createdById: principal.userId,
            versions: {
              create: {
                version: 1,
                title: title.title,
                slug: title.slug,
                content,
                contentHash,
                source: VersionSource.SYSTEM,
                changeReason: 'Expediente creado desde un título aprobado.',
                createdById: principal.userId,
              },
            },
          },
          include: { versions: true },
        });
        const marked = await tx.titleProposal.updateMany({
          where: { id: title.id, status: TitleStatus.APPROVED },
          data: { status: TitleStatus.USED },
        });
        if (marked.count !== 1) {
          throw new ConflictException(
            'El título cambió mientras se creaba la nota. Recarga e inténtalo nuevamente.',
          );
        }
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: title.clientId,
            userId: principal.userId,
            ...this.auditContext(principal),
            actorType: AuditActorType.USER,
            action: 'note.created_from_approved_title',
            entityType: 'note_document',
            entityId: note.id,
            after: {
              noteId: note.id,
              titleProposalId: title.id,
              version: 1,
              status: note.status,
            },
          },
        });
        return note;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este título ya tiene una nota asociada.');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateNoteDto, principal: AuthPrincipal) {
    const cleanInput = stripTrackedUrlsFromValue(input);
    const current = await this.prisma.noteDocument.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        client: { select: { slug: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { sources: true },
        },
      },
    });
    if (!current) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(principal, 'notes.edit', current.clientId);
    if (!canCreateNoteRevision(current.status)) {
      throw new ConflictException(
        'La nota no admite una nueva versión en su estado actual.',
      );
    }
    if (current.currentVersion !== cleanInput.expectedVersion) {
      throw new ConflictException(
        'La nota cambió mientras la editabas. Recarga antes de guardar.',
      );
    }
    const previous = current.versions[0];
    if (!previous)
      throw new ConflictException('La nota no tiene una versión base.');

    const provided = editableVersionFields.filter(
      (field) => cleanInput[field] !== undefined,
    );
    if (!provided.length) {
      throw new BadRequestException('No se detectaron cambios para guardar.');
    }

    const content =
      cleanInput.content ?? (previous.content as Record<string, unknown>);
    const validatedContent = this.content.validate(content);
    const nextVersion = current.currentVersion + 1;
    const resolvedCta = resolveEditorialCta(current.client.slug, {
      ctaText: cleanInput.ctaText ?? previous.ctaText,
      ctaUrl: cleanInput.ctaUrl ?? previous.ctaUrl,
    });
    const next = {
      title: cleanInput.title ?? previous.title,
      metaTitle: cleanInput.metaTitle ?? previous.metaTitle,
      metaDescription: cleanInput.metaDescription ?? previous.metaDescription,
      slug: cleanInput.slug ?? previous.slug,
      excerpt: cleanInput.excerpt ?? previous.excerpt,
      content: validatedContent,
      authorName: cleanInput.authorName ?? previous.authorName,
      authorRole: cleanInput.authorRole ?? previous.authorRole,
      ctaText: resolvedCta.ctaText,
      ctaUrl: resolvedCta.ctaUrl,
      internalLinks:
        cleanInput.internalLinks ??
        (Array.isArray(previous.internalLinks)
          ? previous.internalLinks.filter(
              (value): value is string => typeof value === 'string',
            )
          : []),
    };
    const changed = provided.some((field) => {
      const candidate =
        field === 'ctaText'
          ? next.ctaText
          : field === 'ctaUrl'
            ? next.ctaUrl
            : cleanInput[field];
      return (
        JSON.stringify(candidate) !==
        JSON.stringify(
          field === 'sources'
            ? previous.sources.map((source) => ({
                type: source.type,
                title: source.title,
                entity: source.entity,
                url: source.url,
                publishedAt: source.publishedAt,
                accessedAt: source.accessedAt,
              }))
            : previous[field],
        )
      );
    });
    if (!changed)
      throw new BadRequestException(
        'Los valores enviados no contienen cambios.',
      );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.noteDocument.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          currentVersion: cleanInput.expectedVersion,
          status: current.status,
        },
        data: {
          currentVersion: nextVersion,
          status: NoteStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'La nota cambió mientras la editabas. Recarga antes de guardar.',
        );
      }
      const revokedAt = new Date();
      const revokedReviewLinks = await tx.clientReviewLink.updateMany({
        where: {
          noteId: id,
          status: {
            in: [
              ClientReviewLinkStatus.ACTIVE,
              ClientReviewLinkStatus.COMPLETED,
            ],
          },
        },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedById: principal.userId,
          revokedAt,
        },
      });
      const revokedPackageLinks = await tx.notePackageReviewLink.updateMany({
        where: {
          status: {
            in: [
              ClientReviewLinkStatus.ACTIVE,
              ClientReviewLinkStatus.COMPLETED,
            ],
          },
          items: { some: { noteId: id } },
        },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedById: principal.userId,
          revokedAt,
        },
      });
      const version = await tx.noteVersion.create({
        data: {
          noteId: id,
          version: nextVersion,
          ...next,
          wordCount: this.content.wordCount(validatedContent),
          contentHash: this.content.hash(validatedContent),
          source: VersionSource.HUMAN,
          correctionType: cleanInput.correctionType,
          changeReason: cleanInput.reason,
          createdById: principal.userId,
          sources: {
            create: (cleanInput.sources ?? previous.sources).map((source) => ({
              type: source.type,
              title: source.title,
              entity: source.entity,
              url: source.url,
              publishedAt: source.publishedAt,
              accessedAt: source.accessedAt,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: current.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: 'note.version.created',
          entityType: 'note_document',
          entityId: id,
          before: {
            version: current.currentVersion,
            status: current.status,
            contentHash: previous.contentHash,
          },
          after: {
            version: nextVersion,
            status: NoteStatus.DRAFT,
            contentHash: version.contentHash,
          },
          metadata: {
            reason: cleanInput.reason,
            correctionType: cleanInput.correctionType,
            fields: provided,
            revisionAfterExport: current.status === NoteStatus.EXPORTED,
            revokedReviewLinkCount: revokedReviewLinks.count,
            revokedPackageReviewLinkCount: revokedPackageLinks.count,
          },
        },
      });
      return tx.noteDocument.findUniqueOrThrow({
        where: { id },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { sources: true },
          },
        },
      });
    });
  }

  async queueQa(id: string, expectedVersion: number, principal: AuthPrincipal) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(principal, 'notes.qa', note.clientId);
    if (!canQueueNoteQa(note.status)) {
      throw new ConflictException(
        'Solo un borrador o una versión con cambios solicitados puede enviarse a QA.',
      );
    }
    if (note.currentVersion !== expectedVersion) {
      throw new ConflictException(
        'La versión cambió. Recarga antes de continuar.',
      );
    }
    const version = note.versions[0];
    if (!version || version.wordCount < 1) {
      throw new BadRequestException('Agrega contenido antes de solicitar QA.');
    }
    const previousEvaluation = await this.prisma.noteQaEvaluation.findUnique({
      where: {
        noteId_version: { noteId: id, version: expectedVersion },
      },
    });
    if (
      previousEvaluation &&
      previousEvaluation.status !== EvaluationStatus.FAILED
    ) {
      throw new ConflictException('Esta versión ya tiene un QA registrado.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.noteDocument.updateMany({
          where: {
            id,
            tenantId: principal.tenantId,
            currentVersion: expectedVersion,
            status: note.status,
          },
          data: { status: NoteStatus.QA_QUEUED },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('La nota cambió antes de enviarse a QA.');
        }
        const evaluation = previousEvaluation
          ? await tx.noteQaEvaluation.update({
              where: { id: previousEvaluation.id },
              data: {
                status: EvaluationStatus.QUEUED,
                verdict: null,
                overallScore: null,
                summary: null,
                criticalBlockers: Prisma.JsonNull,
                requestedById: principal.userId,
                startedAt: null,
                completedAt: null,
              },
            })
          : await tx.noteQaEvaluation.create({
              data: {
                noteId: id,
                version: expectedVersion,
                requestedById: principal.userId,
              },
            });
        if (previousEvaluation) {
          await tx.noteQaResult.deleteMany({
            where: { evaluationId: evaluation.id },
          });
        }
        const resetOutbox = previousEvaluation
          ? await tx.outboxJob.updateMany({
              where: {
                jobType: NOTE_QA_JOB,
                aggregateType: 'note_qa_evaluation',
                aggregateId: evaluation.id,
              },
              data: {
                status: OutboxJobStatus.PENDING,
                attempts: 0,
                availableAt: new Date(),
                dispatchedAt: null,
                lastError: null,
              },
            })
          : { count: 0 };
        const outbox =
          resetOutbox.count > 0
            ? await tx.outboxJob.findFirstOrThrow({
                where: {
                  jobType: NOTE_QA_JOB,
                  aggregateType: 'note_qa_evaluation',
                  aggregateId: evaluation.id,
                },
              })
            : await tx.outboxJob.create({
                data: {
                  tenantId: principal.tenantId,
                  jobType: NOTE_QA_JOB,
                  aggregateType: 'note_qa_evaluation',
                  aggregateId: evaluation.id,
                  payload: { evaluationId: evaluation.id },
                },
              });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: note.clientId,
            userId: principal.userId,
            ...this.auditContext(principal),
            actorType: AuditActorType.USER,
            action: previousEvaluation ? 'note.qa.requeued' : 'note.qa.queued',
            entityType: 'note_qa_evaluation',
            entityId: evaluation.id,
            metadata: {
              noteId: id,
              version: expectedVersion,
              outboxJobId: outbox.id,
            },
          },
        });
        return evaluation;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Esta versión ya tiene un QA registrado.');
      }
      throw error;
    }
  }

  async decide(id: string, input: NoteDecisionDto, principal: AuthPrincipal) {
    const note = await this.findOwned(id, principal);
    const permission =
      input.type === NoteDecisionType.APPROVE
        ? 'notes.approve'
        : 'notes.review';
    this.assertClientPermission(principal, permission, note.clientId);
    if (note.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'La versión cambió. Recarga antes de decidir.',
      );
    }
    if (
      input.type === NoteDecisionType.APPROVE &&
      note.status !== NoteStatus.READY_FOR_REVIEW
    ) {
      throw new ConflictException(
        'La nota todavía no está lista para aprobación.',
      );
    }
    if (
      input.type !== NoteDecisionType.APPROVE &&
      note.status !== NoteStatus.READY_FOR_REVIEW &&
      note.status !== NoteStatus.APPROVED
    ) {
      throw new ConflictException(
        'La nota no admite esta decisión en su estado actual.',
      );
    }
    if (input.type === NoteDecisionType.APPROVE) {
      const [qa, individualClientApproval, packageClientApproval] =
        await Promise.all([
          this.prisma.noteQaEvaluation.findUnique({
            where: {
              noteId_version: { noteId: id, version: input.expectedVersion },
            },
          }),
          this.prisma.clientReviewDecision.findFirst({
            where: {
              type: ClientReviewDecisionType.APPROVE,
              link: {
                noteId: id,
                version: input.expectedVersion,
                status: ClientReviewLinkStatus.COMPLETED,
              },
            },
            select: { id: true },
          }),
          this.prisma.notePackageReviewDecision.findFirst({
            where: {
              type: ClientReviewDecisionType.APPROVE,
              item: {
                noteId: id,
                version: input.expectedVersion,
                link: { status: ClientReviewLinkStatus.COMPLETED },
              },
            },
            select: { id: true },
          }),
        ]);
      const blockers = Array.isArray(qa?.criticalBlockers)
        ? qa.criticalBlockers
        : [];
      if (
        !qa ||
        qa.status !== EvaluationStatus.COMPLETED ||
        qa.verdict !== EvaluationVerdict.PASS ||
        (qa.overallScore ?? 0) < 80 ||
        blockers.length
      ) {
        throw new ConflictException(
          'La aprobación exige QA completado con 80 o más y sin bloqueos críticos.',
        );
      }
      if (!individualClientApproval && !packageClientApproval) {
        throw new ConflictException(
          'La aprobación interna exige una aprobación registrada del cliente para esta versión.',
        );
      }
    }

    const nextStatus =
      input.type === NoteDecisionType.APPROVE
        ? NoteStatus.APPROVED
        : input.type === NoteDecisionType.REJECT
          ? NoteStatus.REJECTED
          : NoteStatus.CHANGES_REQUESTED;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.noteDocument.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          currentVersion: input.expectedVersion,
          status: note.status,
        },
        data: {
          status: nextStatus,
          ...(input.type === NoteDecisionType.APPROVE
            ? { approvedById: principal.userId, approvedAt: new Date() }
            : { approvedById: null, approvedAt: null }),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'La nota cambió antes de registrar la decisión.',
        );
      }
      await tx.clientReviewLink.updateMany({
        where: { noteId: id, status: ClientReviewLinkStatus.ACTIVE },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedById: principal.userId,
          revokedAt: new Date(),
        },
      });
      const decision = await tx.noteDecision.create({
        data: {
          noteId: id,
          version: input.expectedVersion,
          type: input.type,
          reason: input.reason,
          actorId: principal.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: note.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: `note.decision.${input.type.toLowerCase()}`,
          entityType: 'note_document',
          entityId: id,
          before: { status: note.status, version: note.currentVersion },
          after: { status: nextStatus, version: note.currentVersion },
          metadata: { decisionId: decision.id, reason: input.reason },
        },
      });
      return {
        note: await tx.noteDocument.findUniqueOrThrow({ where: { id } }),
        decision,
      };
    });
  }

  async imageProposal(id: string, principal: AuthPrincipal) {
    const note = await this.findOwned(id, principal);
    this.assertClientPermission(principal, 'notes.read', note.clientId);
    return this.prisma.noteImageProposal.findUnique({
      where: {
        noteId_version: { noteId: id, version: note.currentVersion },
      },
      include: {
        approvedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async updateImageProposal(
    id: string,
    input: UpdateNoteImageProposalDto,
    principal: AuthPrincipal,
  ) {
    const note = await this.findOwned(id, principal);
    this.assertClientPermission(principal, 'notes.edit', note.clientId);
    if (note.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'La versión cambió. Recarga antes de editar la propuesta visual.',
      );
    }
    const current = await this.prisma.noteImageProposal.findUnique({
      where: {
        noteId_version: { noteId: id, version: input.expectedVersion },
      },
    });
    const data = {
      concept: input.concept.trim(),
      prompt: input.prompt.trim(),
      altText: input.altText.trim(),
      caption: input.caption?.trim() || null,
      referenceUrl: input.referenceUrl?.trim() || null,
      status: NoteImageStatus.PROPOSED,
      decisionReason: null,
      approvedById: null,
      approvedAt: null,
    };
    const proposal = await this.prisma.noteImageProposal.upsert({
      where: {
        noteId_version: { noteId: id, version: input.expectedVersion },
      },
      create: {
        tenantId: note.tenantId,
        clientId: note.clientId,
        noteId: id,
        version: input.expectedVersion,
        createdById: principal.userId,
        ...data,
      },
      update: data,
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: note.tenantId,
        clientId: note.clientId,
        userId: principal.userId,
        ...this.auditContext(principal),
        actorType: AuditActorType.USER,
        action: current
          ? 'note.image_proposal.updated'
          : 'note.image_proposal.created',
        entityType: 'note_image_proposal',
        entityId: proposal.id,
        before: current
          ? {
              concept: current.concept,
              altText: current.altText,
              status: current.status,
            }
          : undefined,
        after: {
          noteId: id,
          version: input.expectedVersion,
          concept: proposal.concept,
          altText: proposal.altText,
          status: proposal.status,
        },
      },
    });
    return proposal;
  }

  async decideImageProposal(
    id: string,
    input: NoteImageDecisionDto,
    principal: AuthPrincipal,
  ) {
    const note = await this.findOwned(id, principal);
    const permission =
      input.status === NoteImageStatus.APPROVED
        ? 'notes.approve'
        : 'notes.review';
    this.assertClientPermission(principal, permission, note.clientId);
    if (note.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'La versión cambió. Recarga antes de decidir la propuesta visual.',
      );
    }
    if (
      ![
        NoteImageStatus.APPROVED,
        NoteImageStatus.CHANGES_REQUESTED,
        NoteImageStatus.REJECTED,
      ].includes(input.status)
    ) {
      throw new BadRequestException('La decisión visual no es válida.');
    }
    const current = await this.prisma.noteImageProposal.findUnique({
      where: {
        noteId_version: { noteId: id, version: input.expectedVersion },
      },
    });
    if (!current) {
      throw new ConflictException(
        'Primero registra una propuesta visual para esta versión.',
      );
    }
    const proposal = await this.prisma.noteImageProposal.update({
      where: { id: current.id },
      data: {
        status: input.status,
        decisionReason: input.reason.trim(),
        approvedById:
          input.status === NoteImageStatus.APPROVED ? principal.userId : null,
        approvedAt:
          input.status === NoteImageStatus.APPROVED ? new Date() : null,
      },
      include: { approvedBy: { select: { id: true, displayName: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: note.tenantId,
        clientId: note.clientId,
        userId: principal.userId,
        ...this.auditContext(principal),
        actorType: AuditActorType.USER,
        action: `note.image_proposal.${input.status.toLowerCase()}`,
        entityType: 'note_image_proposal',
        entityId: proposal.id,
        before: { status: current.status },
        after: { status: proposal.status, reason: input.reason.trim() },
        metadata: { noteId: id, version: input.expectedVersion },
      },
    });
    return proposal;
  }

  private async findOwned(id: string, principal: AuthPrincipal) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    return note;
  }

  private assertClientPermission(
    principal: AuthPrincipal,
    permission: string,
    clientId: string,
  ): void {
    if (!hasPermission(principal, permission, clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }

  private auditContext(principal: AuthPrincipal) {
    return {
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
    };
  }
}
