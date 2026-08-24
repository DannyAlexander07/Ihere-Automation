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
  ClientReviewLinkStatus,
  DuplicateResolution,
  Prisma,
  TitleDecisionType,
  TitleStatus,
  VersionSource,
} from '../generated/prisma/client';
import { CreateTitleDto } from './dto/create-title.dto';
import { ListTitlesDto } from './dto/list-titles.dto';
import { TitleDecisionDto } from './dto/title-decision.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { TitleWorkflowService } from './title-workflow.service';
import { TITLE_EVALUATION_JOB } from './title-evaluation-queue.service';

const editableFields = [
  'title',
  'objective',
  'audience',
  'searchIntent',
  'focus',
  'opportunity',
  'risk',
] as const;

@Injectable()
export class TitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: TitleWorkflowService,
  ) {}

  async list(query: ListTitlesDto, principal: AuthPrincipal) {
    if (query.clientId)
      this.assertClientPermission(principal, 'titles.read', query.clientId);
    const tenantWide = principal.tenantPermissions.includes('titles.read');
    return this.prisma.titleProposal.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(query.clientId
          ? { clientId: query.clientId }
          : tenantWide
            ? {}
            : {
                clientId: {
                  in: clientIdsForPermission(principal, 'titles.read'),
                },
              }),
        ...(query.status ? { status: query.status } : {}),
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        objective: true,
        audience: true,
        searchIntent: true,
        focus: true,
        opportunity: true,
        risk: true,
        status: true,
        duplicateScore: true,
        duplicateResolution: true,
        currentVersion: true,
        generationRunId: true,
        createdAt: true,
        updatedAt: true,
        client: { select: { name: true, slug: true } },
        createdBy: { select: { displayName: true } },
        generationRun: {
          select: {
            id: true,
            createdAt: true,
            campaignYear: true,
            campaignMonth: true,
            campaignTopic: true,
            editorialFolderKey: true,
            inputSnapshot: true,
            requestedBy: { select: { displayName: true } },
          },
        },
        titlePackageReviewItems: {
          where: { decision: { isNot: null } },
          select: {
            version: true,
            link: { select: { createdAt: true } },
            decision: {
              select: { type: true, reason: true, createdAt: true },
            },
          },
        },
        duplicateOf: {
          select: { id: true, title: true, status: true, createdAt: true },
        },
        evaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            verdict: true,
            overallScore: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string, principal: AuthPrincipal) {
    const title = await this.prisma.titleProposal.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { displayName: true } },
        generationRun: {
          select: {
            id: true,
            createdAt: true,
            campaignYear: true,
            campaignMonth: true,
            campaignTopic: true,
            editorialFolderKey: true,
            inputSnapshot: true,
            requestedBy: { select: { displayName: true } },
          },
        },
        titlePackageReviewItems: {
          where: { decision: { isNot: null } },
          select: {
            version: true,
            link: { select: { createdAt: true } },
            decision: {
              select: { type: true, reason: true, createdAt: true },
            },
          },
        },
        duplicateOf: {
          select: { id: true, title: true, status: true, createdAt: true },
        },
        versions: { orderBy: { version: 'desc' } },
        evaluations: {
          orderBy: { createdAt: 'desc' },
          include: {
            agentResults: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                agentType: true,
                verdict: true,
                score: true,
                summary: true,
                findings: true,
                evidence: true,
                provider: true,
                model: true,
                inputTokens: true,
                outputTokens: true,
                durationMs: true,
                errorCode: true,
                createdAt: true,
              },
            },
          },
        },
        decisions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!title) throw new NotFoundException('Título no encontrado.');
    this.assertClientPermission(principal, 'titles.read', title.clientId);
    return title;
  }

  async create(input: CreateTitleDto, principal: AuthPrincipal) {
    this.assertClientPermission(principal, 'titles.create', input.clientId);
    await this.assertClientExists(input.clientId, principal.tenantId);
    const canonicalTitle = this.canonicalize(input.title);

    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.titleProposal.create({
        data: {
          tenantId: principal.tenantId,
          clientId: input.clientId,
          title: input.title,
          canonicalTitle,
          objective: input.objective,
          audience: input.audience,
          searchIntent: input.searchIntent,
          focus: input.focus,
          opportunity: input.opportunity,
          risk: input.risk,
          createdById: principal.userId,
          versions: {
            create: {
              version: 1,
              title: input.title,
              objective: input.objective,
              audience: input.audience,
              searchIntent: input.searchIntent,
              focus: input.focus,
              opportunity: input.opportunity,
              risk: input.risk,
              source: VersionSource.HUMAN,
              createdById: principal.userId,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: input.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: 'title.created',
          entityType: 'title_proposal',
          entityId: proposal.id,
          after: this.snapshot(proposal),
        },
      });
      return proposal;
    });
  }

  async update(
    id: string,
    input: UpdateTitleDto,
    principal: AuthPrincipal,
    queueEvaluation = false,
  ) {
    const current = await this.findOwned(id, principal);
    this.assertClientPermission(principal, 'titles.edit', current.clientId);
    if (queueEvaluation) {
      this.assertClientPermission(
        principal,
        'titles.evaluate',
        current.clientId,
      );
    }
    this.workflow.assertEditable(current.status);
    if (current.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'El título cambió mientras lo revisabas. Recarga antes de guardar.',
      );
    }

    const changes = editableFields.flatMap((field) => {
      const next = input[field];
      return next !== undefined && next !== current[field]
        ? [{ field, beforeValue: current[field] ?? '', afterValue: next }]
        : [];
    });
    if (!changes.length)
      throw new BadRequestException('No se detectaron cambios para guardar.');

    const nextVersion = current.currentVersion + 1;
    const nextValues = Object.fromEntries(
      changes.map((change) => [change.field, change.afterValue]),
    );
    const merged = { ...current, ...nextValues };

    return this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.titleProposal.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          currentVersion: input.expectedVersion,
          status: current.status,
        },
        data: {
          ...nextValues,
          ...(nextValues.title
            ? { canonicalTitle: this.canonicalize(nextValues.title) }
            : {}),
          currentVersion: nextVersion,
          status: queueEvaluation
            ? TitleStatus.EVALUATING
            : current.status === TitleStatus.CHANGES_REQUESTED
              ? TitleStatus.PROPOSED
              : current.status,
          approvedById: null,
          approvedAt: null,
          duplicateScore: 0,
          duplicateResolution: DuplicateResolution.PENDING,
          duplicateOfId: null,
        },
      });
      if (updatedCount.count !== 1) {
        throw new ConflictException(
          'El título cambió mientras lo revisabas. Recarga antes de guardar.',
        );
      }
      const revokedReviewLinks = await tx.titleReviewLink.updateMany({
        where: {
          proposalId: id,
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
          revokedAt: new Date(),
        },
      });
      const version = await tx.titleVersion.create({
        data: {
          proposalId: id,
          version: nextVersion,
          title: merged.title,
          objective: merged.objective,
          audience: merged.audience,
          searchIntent: merged.searchIntent,
          focus: merged.focus,
          opportunity: merged.opportunity,
          risk: merged.risk,
          source: VersionSource.HUMAN,
          correctionType: input.correctionType,
          changeReason: input.reason,
          createdById: principal.userId,
        },
      });
      await tx.correctionSignal.createMany({
        data: changes.map((change) => ({
          tenantId: principal.tenantId,
          clientId: current.clientId,
          proposalId: id,
          versionId: version.id,
          field: change.field,
          beforeValue: change.beforeValue,
          afterValue: change.afterValue,
          reason: input.reason,
          correctionType: input.correctionType,
          actorId: principal.userId,
        })),
      });
      const updated = await tx.titleProposal.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: current.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: 'title.updated',
          entityType: 'title_proposal',
          entityId: id,
          before: this.snapshot(current),
          after: this.snapshot(updated),
          metadata: {
            reason: input.reason,
            correctionType: input.correctionType,
            revokedClientReviewLinkCount: revokedReviewLinks.count,
          },
        },
      });
      if (queueEvaluation) {
        const evaluation = await tx.titleEvaluation.create({
          data: {
            proposalId: id,
            version: nextVersion,
            requestedById: principal.userId,
          },
        });
        const outbox = await tx.outboxJob.create({
          data: {
            tenantId: principal.tenantId,
            jobType: TITLE_EVALUATION_JOB,
            aggregateType: 'title_evaluation',
            aggregateId: evaluation.id,
            payload: { evaluationId: evaluation.id },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: current.clientId,
            userId: principal.userId,
            ...this.auditContext(principal),
            actorType: AuditActorType.USER,
            action: 'title.evaluation.queued',
            entityType: 'title_evaluation',
            entityId: evaluation.id,
            metadata: {
              proposalId: id,
              version: nextVersion,
              outboxJobId: outbox.id,
              queuedWithRevision: true,
            },
          },
        });
      }
      return updated;
    });
  }

  updateAndQueueEvaluation(
    id: string,
    input: UpdateTitleDto,
    principal: AuthPrincipal,
  ) {
    return this.update(id, input, principal, true);
  }

  async submit(id: string, expectedVersion: number, principal: AuthPrincipal) {
    const current = await this.findOwned(id, principal);
    this.assertClientPermission(principal, 'titles.edit', current.clientId);
    this.workflow.assertEditable(current.status);
    if (current.currentVersion !== expectedVersion)
      throw this.versionConflict();
    if (
      current.status !== TitleStatus.DRAFT &&
      current.status !== TitleStatus.CHANGES_REQUESTED
    ) {
      throw new ConflictException('El título ya fue enviado a revisión.');
    }
    return this.changeStatus(
      current,
      TitleStatus.PROPOSED,
      'title.submitted',
      principal,
    );
  }

  async queueEvaluation(
    id: string,
    expectedVersion: number,
    principal: AuthPrincipal,
  ) {
    const current = await this.findOwned(id, principal);
    this.assertClientPermission(principal, 'titles.evaluate', current.clientId);
    this.workflow.assertCanQueueEvaluation(current.status);
    if (current.currentVersion !== expectedVersion)
      throw this.versionConflict();

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.titleProposal.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          currentVersion: expectedVersion,
          status: current.status,
        },
        data: { status: TitleStatus.EVALUATING },
      });
      if (claimed.count !== 1) throw this.versionConflict();
      const evaluation = await tx.titleEvaluation.create({
        data: {
          proposalId: id,
          version: current.currentVersion,
          requestedById: principal.userId,
        },
      });
      const outbox = await tx.outboxJob.create({
        data: {
          tenantId: principal.tenantId,
          jobType: TITLE_EVALUATION_JOB,
          aggregateType: 'title_evaluation',
          aggregateId: evaluation.id,
          payload: { evaluationId: evaluation.id },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: current.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: 'title.evaluation.queued',
          entityType: 'title_evaluation',
          entityId: evaluation.id,
          metadata: {
            proposalId: id,
            version: current.currentVersion,
            outboxJobId: outbox.id,
          },
        },
      });
      return evaluation;
    });
  }

  async decide(id: string, input: TitleDecisionDto, principal: AuthPrincipal) {
    const current = await this.findOwned(id, principal);
    const permission =
      input.type === TitleDecisionType.APPROVE
        ? 'titles.approve'
        : input.type === TitleDecisionType.MARK_USED
          ? 'titles.publish'
          : 'titles.review';
    this.assertClientPermission(principal, permission, current.clientId);
    if (current.currentVersion !== input.expectedVersion)
      throw this.versionConflict();

    const evaluation = await this.prisma.titleEvaluation.findFirst({
      where: { proposalId: id, version: current.currentVersion },
      orderBy: { createdAt: 'desc' },
    });

    if (input.type === TitleDecisionType.RESOLVE_DUPLICATE) {
      this.workflow.assertCanResolveDuplicate(
        current.status,
        current.duplicateScore,
        current.duplicateResolution,
      );
      if (
        !input.duplicateResolution ||
        input.duplicateResolution === DuplicateResolution.PENDING
      ) {
        throw new BadRequestException(
          'Selecciona una resolución de duplicidad definitiva.',
        );
      }
    } else {
      this.workflow.assertCanDecide(
        current.status,
        input.type,
        current.duplicateScore,
        current.duplicateResolution,
        evaluation ?? undefined,
      );
    }

    const nextStatus =
      input.type === TitleDecisionType.RESOLVE_DUPLICATE
        ? input.duplicateResolution === DuplicateResolution.DISCARD
          ? TitleStatus.REJECTED
          : current.status
        : this.workflow.statusForDecision(input.type);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.titleProposal.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          currentVersion: input.expectedVersion,
          status: current.status,
          duplicateResolution: current.duplicateResolution,
        },
        data: {
          status: nextStatus,
          ...(input.duplicateResolution
            ? { duplicateResolution: input.duplicateResolution }
            : {}),
          ...(input.type === TitleDecisionType.APPROVE
            ? { approvedById: principal.userId, approvedAt: new Date() }
            : {}),
        },
      });
      if (claimed.count !== 1) throw this.versionConflict();
      const decision = await tx.titleDecision.create({
        data: {
          proposalId: id,
          version: current.currentVersion,
          type: input.type,
          reason: input.reason,
          duplicateResolution: input.duplicateResolution,
          actorId: principal.userId,
        },
      });
      const updated = await tx.titleProposal.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: current.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action: `title.decision.${input.type.toLowerCase()}`,
          entityType: 'title_proposal',
          entityId: id,
          before: this.snapshot(current),
          after: this.snapshot(updated),
          metadata: { decisionId: decision.id, reason: input.reason },
        },
      });
      return { proposal: updated, decision };
    });
  }

  private async changeStatus(
    current: Awaited<ReturnType<TitlesService['findOwned']>>,
    status: TitleStatus,
    action: string,
    principal: AuthPrincipal,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.titleProposal.updateMany({
        where: {
          id: current.id,
          tenantId: principal.tenantId,
          currentVersion: current.currentVersion,
          status: current.status,
        },
        data: { status },
      });
      if (claimed.count !== 1) throw this.versionConflict();
      const updated = await tx.titleProposal.findUniqueOrThrow({
        where: { id: current.id },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: current.clientId,
          userId: principal.userId,
          ...this.auditContext(principal),
          actorType: AuditActorType.USER,
          action,
          entityType: 'title_proposal',
          entityId: current.id,
          before: this.snapshot(current),
          after: this.snapshot(updated),
        },
      });
      return updated;
    });
  }

  private async findOwned(id: string, principal: AuthPrincipal) {
    const title = await this.prisma.titleProposal.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!title) throw new NotFoundException('Título no encontrado.');
    return title;
  }

  private async assertClientExists(
    clientId: string,
    tenantId: string,
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, active: true },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
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

  private canonicalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private auditContext(principal: AuthPrincipal) {
    return {
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
    };
  }

  private snapshot(value: Record<string, unknown>): Prisma.InputJsonObject {
    const { createdAt, updatedAt, approvedAt, ...rest } = value;
    return {
      ...rest,
      ...(createdAt instanceof Date
        ? { createdAt: createdAt.toISOString() }
        : {}),
      ...(updatedAt instanceof Date
        ? { updatedAt: updatedAt.toISOString() }
        : {}),
      ...(approvedAt instanceof Date
        ? { approvedAt: approvedAt.toISOString() }
        : {}),
    };
  }

  private versionConflict(): ConflictException {
    return new ConflictException(
      'La versión cambió. Recarga antes de continuar.',
    );
  }
}
