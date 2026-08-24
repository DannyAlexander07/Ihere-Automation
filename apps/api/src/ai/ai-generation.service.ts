import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { hasPermission } from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import {
  AiGenerationKind,
  AiGenerationStatus,
  AuditActorType,
  LearningRuleStatus,
  NoteStatus,
  Prisma,
  TitleStatus,
} from '../generated/prisma/client';
import { AI_PRICING_VERSION } from './ai-pricing.service';
import { AI_GENERATION_JOB } from './ai-generation-queue.service';
import type { CreateTitleGenerationDto } from './dto/create-title-generation.dto';
import type { CreateTitleBriefDto } from './dto/create-title-brief.dto';
import type { CreateNoteGenerationDto } from './dto/create-note-generation.dto';
import { OpenAiProviderService } from './openai-provider.service';

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: OpenAiProviderService,
  ) {}

  async queueTitleGeneration(
    input: CreateTitleGenerationDto,
    principal: AuthPrincipal,
  ) {
    this.assertClientPermission(principal, 'ai.generate', input.clientId);
    this.assertClientPermission(principal, 'titles.create', input.clientId);
    if (!this.provider.enabled) {
      throw new ServiceUnavailableException(
        'La automatización editorial no está habilitada en este entorno.',
      );
    }
    const client = await this.prisma.client.findFirst({
      where: {
        id: input.clientId,
        tenantId: principal.tenantId,
        active: true,
      },
      select: { id: true, name: true, slug: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');

    const [history, activeRules, corrections] = await Promise.all([
      this.prisma.titleProposal.findMany({
        where: { tenantId: principal.tenantId, clientId: input.clientId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          title: true,
          objective: true,
          searchIntent: true,
          focus: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.learningRule.findMany({
        where: {
          tenantId: principal.tenantId,
          status: LearningRuleStatus.ACTIVE,
          OR: [{ clientId: input.clientId }, { clientId: null }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, description: true },
      }),
      this.prisma.correctionSignal.findMany({
        where: { tenantId: principal.tenantId, clientId: input.clientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          field: true,
          beforeValue: true,
          afterValue: true,
          reason: true,
          correctionType: true,
          createdAt: true,
        },
      }),
    ]);
    const count = input.count ?? 5;
    const campaignTopic = input.topic.trim();
    const editorialFolderKey = this.folderKey(
      client.slug,
      input.campaignYear,
      input.campaignMonth,
      campaignTopic,
    );
    const snapshot: Prisma.InputJsonObject = {
      request: {
        topic: campaignTopic,
        objective: input.objective.trim(),
        audience: input.audience.trim(),
        searchIntent: input.searchIntent.trim(),
        campaignYear: input.campaignYear,
        campaignMonth: input.campaignMonth,
        count,
        additionalContext: input.additionalContext?.trim() || null,
      },
      client,
      history: history.map((item) => ({
        ...item,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      activeRules,
      corrections: corrections.map((item) => ({
        ...item,
        correctionType: item.correctionType,
        createdAt: item.createdAt.toISOString(),
      })),
    };
    const runBudget = BigInt(
      this.config.getOrThrow<number>('AI_RUN_BUDGET_MICROS'),
    );
    const monthlyBudget = BigInt(
      this.config.getOrThrow<number>('AI_MONTHLY_BUDGET_MICROS'),
    );

    const run = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ihere-ai-budget:${principal.tenantId}`}))::text AS lock_result`;
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const [spent, active] = await Promise.all([
          tx.aiGenerationRun.aggregate({
            where: {
              tenantId: principal.tenantId,
              createdAt: { gte: monthStart },
            },
            _sum: { costMicros: true },
          }),
          tx.aiGenerationRun.findMany({
            where: {
              tenantId: principal.tenantId,
              createdAt: { gte: monthStart },
              status: {
                in: [AiGenerationStatus.QUEUED, AiGenerationStatus.RUNNING],
              },
            },
            select: { budgetLimitMicros: true, costMicros: true },
          }),
        ]);
        const spentMicros = spent._sum.costMicros ?? 0n;
        const reservedMicros = active.reduce(
          (total, item) =>
            total +
            (item.budgetLimitMicros > item.costMicros
              ? item.budgetLimitMicros - item.costMicros
              : 0n),
          0n,
        );
        const budgetAvailable =
          spentMicros + reservedMicros + runBudget <= monthlyBudget;
        const created = await tx.aiGenerationRun.create({
          data: {
            tenantId: principal.tenantId,
            clientId: input.clientId,
            kind: AiGenerationKind.TITLE_PROPOSALS,
            status: budgetAvailable
              ? AiGenerationStatus.QUEUED
              : AiGenerationStatus.BUDGET_BLOCKED,
            requestedById: principal.userId,
            provider: 'openai',
            model: this.provider.primaryModel,
            reasoningEffort: this.provider.reasoningEffort,
            inputSnapshot: snapshot,
            campaignYear: input.campaignYear,
            campaignMonth: input.campaignMonth,
            campaignTopic,
            editorialFolderKey,
            budgetLimitMicros: runBudget,
            pricingVersion: AI_PRICING_VERSION,
            ...(!budgetAvailable
              ? {
                  completedAt: new Date(),
                  errorCode: 'MONTHLY_BUDGET_EXCEEDED',
                  errorMessage:
                    'El presupuesto mensual disponible no permite reservar esta ejecución.',
                }
              : {}),
          },
        });
        let outboxJobId: string | null = null;
        if (budgetAvailable) {
          const outbox = await tx.outboxJob.create({
            data: {
              tenantId: principal.tenantId,
              jobType: AI_GENERATION_JOB,
              aggregateType: 'ai_generation_run',
              aggregateId: created.id,
              payload: { runId: created.id, dispatchId: randomUUID() },
            },
          });
          outboxJobId = outbox.id;
        }
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: input.clientId,
            userId: principal.userId,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            actorType: AuditActorType.USER,
            action: budgetAvailable
              ? 'ai.title_generation.queued'
              : 'ai.title_generation.budget_blocked',
            entityType: 'ai_generation_run',
            entityId: created.id,
            metadata: {
              model: created.model,
              reasoningEffort: created.reasoningEffort,
              count,
              budgetLimitMicros: Number(runBudget),
              monthlyBudgetMicros: Number(monthlyBudget),
              outboxJobId,
            },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.present(run);
  }

  async queueTitleBrief(input: CreateTitleBriefDto, principal: AuthPrincipal) {
    this.assertClientPermission(principal, 'ai.generate', input.clientId);
    this.assertClientPermission(principal, 'titles.create', input.clientId);
    if (!this.provider.enabled) {
      throw new ServiceUnavailableException(
        'La automatización editorial no está habilitada en este entorno.',
      );
    }
    const context = await this.titleContext(input.clientId, principal.tenantId);
    if (!context.client) throw new NotFoundException('Cliente no encontrado.');
    const snapshot: Prisma.InputJsonObject = {
      request: {
        campaignYear: input.campaignYear,
        campaignMonth: input.campaignMonth,
        searchIntent: input.searchIntent,
      },
      client: context.client,
      history: context.history,
      activeRules: context.activeRules,
      corrections: context.corrections,
    };
    const run = await this.queueGenericRun({
      tenantId: principal.tenantId,
      clientId: input.clientId,
      requestedById: principal.userId,
      principal,
      kind: AiGenerationKind.TITLE_BRIEF,
      snapshot,
      campaignYear: input.campaignYear,
      campaignMonth: input.campaignMonth,
      auditAction: 'ai.title_brief.queued',
    });
    return this.present(run);
  }

  async queuePendingTitleRevisions(
    generationRunId: string,
    principal: AuthPrincipal,
  ) {
    if (!this.provider.enabled) {
      throw new ServiceUnavailableException(
        'La automatización editorial no está habilitada en este entorno.',
      );
    }
    const sourceRun = await this.prisma.aiGenerationRun.findFirst({
      where: {
        id: generationRunId,
        tenantId: principal.tenantId,
        kind: AiGenerationKind.TITLE_PROPOSALS,
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        titleProposals: {
          where: {
            status: {
              in: [TitleStatus.CHANGES_REQUESTED, TitleStatus.REJECTED],
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!sourceRun)
      throw new NotFoundException('Paquete de títulos no encontrado.');
    this.assertClientPermission(principal, 'ai.generate', sourceRun.clientId);
    this.assertClientPermission(principal, 'titles.edit', sourceRun.clientId);
    if (!sourceRun.titleProposals.length) {
      throw new ConflictException(
        'Este paquete no tiene títulos observados o rechazados por corregir.',
      );
    }
    const proposalIds = sourceRun.titleProposals.map((item) => item.id);
    const decisions = await this.prisma.titlePackageReviewDecision.findMany({
      where: { item: { proposalId: { in: proposalIds } } },
      select: {
        type: true,
        reason: true,
        createdAt: true,
        item: { select: { proposalId: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const latestFeedback = new Map<string, (typeof decisions)[number]>();
    decisions.forEach((decision) => {
      if (!latestFeedback.has(decision.item.proposalId))
        latestFeedback.set(decision.item.proposalId, decision);
    });
    const [activeRules, history] = await Promise.all([
      this.prisma.learningRule.findMany({
        where: {
          tenantId: principal.tenantId,
          status: LearningRuleStatus.ACTIVE,
          OR: [{ clientId: sourceRun.clientId }, { clientId: null }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, description: true },
      }),
      this.prisma.titleProposal.findMany({
        where: {
          tenantId: principal.tenantId,
          clientId: sourceRun.clientId,
          id: { notIn: proposalIds },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: { title: true, searchIntent: true, focus: true },
      }),
    ]);
    const pendingExisting = await this.prisma.aiGenerationRun.findMany({
      where: {
        tenantId: principal.tenantId,
        kind: AiGenerationKind.TITLE_REVISION,
        titleProposalId: { in: proposalIds },
        status: { in: [AiGenerationStatus.QUEUED, AiGenerationStatus.RUNNING] },
      },
      select: { titleProposalId: true },
    });
    const alreadyQueued = new Set(
      pendingExisting.flatMap((item) =>
        item.titleProposalId ? [item.titleProposalId] : [],
      ),
    );
    const queued = [];
    for (const proposal of sourceRun.titleProposals) {
      if (alreadyQueued.has(proposal.id)) continue;
      const feedback = latestFeedback.get(proposal.id);
      if (!feedback) {
        throw new ConflictException(
          `El título “${proposal.title}” no tiene una observación del cliente registrada.`,
        );
      }
      const snapshot: Prisma.InputJsonObject = {
        client: sourceRun.client,
        package: {
          campaignYear:
            sourceRun.campaignYear ?? sourceRun.createdAt.getUTCFullYear(),
          campaignMonth:
            sourceRun.campaignMonth ?? sourceRun.createdAt.getUTCMonth() + 1,
          topic: sourceRun.campaignTopic ?? 'Propuestas editoriales',
          folderKey:
            sourceRun.editorialFolderKey ??
            this.folderKey(
              sourceRun.client.slug,
              sourceRun.createdAt.getUTCFullYear(),
              sourceRun.createdAt.getUTCMonth() + 1,
              sourceRun.campaignTopic ?? 'Propuestas editoriales',
            ),
        },
        proposal: {
          id: proposal.id,
          version: proposal.currentVersion,
          status: proposal.status,
          title: proposal.title,
          objective: proposal.objective,
          audience: proposal.audience,
          searchIntent: proposal.searchIntent,
          focus: proposal.focus,
          opportunity:
            proposal.opportunity ??
            'Debe aportar una oportunidad útil y verificable.',
          risk: proposal.risk ?? 'Evitar afirmaciones no respaldadas.',
        },
        clientFeedback: {
          type: feedback.type,
          reason: feedback.reason,
          createdAt: feedback.createdAt.toISOString(),
        },
        history,
        activeRules,
      };
      queued.push(
        await this.queueGenericRun({
          tenantId: principal.tenantId,
          clientId: sourceRun.clientId,
          requestedById: principal.userId,
          principal,
          kind: AiGenerationKind.TITLE_REVISION,
          snapshot,
          titleProposalId: proposal.id,
          campaignYear: sourceRun.campaignYear ?? undefined,
          campaignMonth: sourceRun.campaignMonth ?? undefined,
          campaignTopic: sourceRun.campaignTopic ?? undefined,
          editorialFolderKey: sourceRun.editorialFolderKey ?? undefined,
          auditAction: 'ai.title_revision.queued',
        }),
      );
    }
    return queued.map((run) => this.present(run));
  }

  async queueNoteGeneration(
    noteId: string,
    input: CreateNoteGenerationDto,
    principal: AuthPrincipal,
  ) {
    const note = await this.prisma.noteDocument.findFirst({
      where: { id: noteId, tenantId: principal.tenantId },
      include: {
        client: { select: { id: true, name: true, slug: true, active: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 20,
          select: {
            version: true,
            title: true,
            metaTitle: true,
            metaDescription: true,
            slug: true,
            excerpt: true,
            content: true,
            authorName: true,
            authorRole: true,
            ctaText: true,
            ctaUrl: true,
            internalLinks: true,
            correctionType: true,
            changeReason: true,
            createdAt: true,
            sources: {
              orderBy: { accessedAt: 'asc' },
              select: { title: true, url: true },
            },
          },
        },
        clientReviewLinks: {
          where: { decision: { isNot: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            version: true,
            decision: {
              select: { type: true, reason: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!note || !note.client.active)
      throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(principal, 'ai.generate', note.clientId);
    this.assertClientPermission(principal, 'notes.edit', note.clientId);
    if (!this.provider.enabled) {
      throw new ServiceUnavailableException(
        'La automatización editorial no está habilitada en este entorno.',
      );
    }
    if (
      note.status !== NoteStatus.DRAFT &&
      note.status !== NoteStatus.CHANGES_REQUESTED
    ) {
      throw new ConflictException(
        'Solo una nota en borrador o con cambios solicitados puede generarse.',
      );
    }
    if (note.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'La nota cambió. Recarga antes de iniciar la generación.',
      );
    }
    const activeRules = await this.prisma.learningRule.findMany({
      where: {
        tenantId: principal.tenantId,
        status: LearningRuleStatus.ACTIVE,
        OR: [{ clientId: note.clientId }, { clientId: null }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, description: true },
    });
    const currentVersion = note.versions[0];
    if (!currentVersion)
      throw new ConflictException('La nota no tiene una versión base.');
    const latestClientDecision = note.clientReviewLinks[0]?.decision;
    const clientFeedback =
      (note.status === NoteStatus.CHANGES_REQUESTED ||
        note.status === NoteStatus.DRAFT) &&
      latestClientDecision
        ? {
            type: latestClientDecision.type,
            reason: latestClientDecision.reason,
            version: note.clientReviewLinks[0].version,
            createdAt: latestClientDecision.createdAt.toISOString(),
          }
        : null;
    const snapshot: Prisma.InputJsonObject = {
      request: {
        additionalInstructions: input.additionalInstructions?.trim() || null,
      },
      client: note.client,
      note: {
        id: note.id,
        currentVersion: note.currentVersion,
        briefSnapshot: note.briefSnapshot,
        currentTitle: currentVersion.title,
        currentDraft: {
          title: currentVersion.title,
          metaTitle: currentVersion.metaTitle,
          metaDescription: currentVersion.metaDescription,
          slug: currentVersion.slug,
          excerpt: currentVersion.excerpt,
          content: currentVersion.content,
          authorName: currentVersion.authorName,
          authorRole: currentVersion.authorRole,
          ctaText: currentVersion.ctaText,
          ctaUrl: currentVersion.ctaUrl,
          internalLinks: Array.isArray(currentVersion.internalLinks)
            ? currentVersion.internalLinks.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
          sources: currentVersion.sources,
        },
      },
      clientFeedback,
      activeRules,
      corrections: note.versions
        .filter((version) => version.changeReason || version.correctionType)
        .map((version) => ({
          title: version.title,
          correctionType: version.correctionType,
          changeReason: version.changeReason,
          createdAt: version.createdAt.toISOString(),
        })),
    };
    const runBudget = BigInt(
      this.config.getOrThrow<number>('AI_RUN_BUDGET_MICROS'),
    );
    const monthlyBudget = BigInt(
      this.config.getOrThrow<number>('AI_MONTHLY_BUDGET_MICROS'),
    );

    const run = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ihere-ai-budget:${principal.tenantId}`}))::text AS lock_result`;
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const [spent, active] = await Promise.all([
          tx.aiGenerationRun.aggregate({
            where: {
              tenantId: principal.tenantId,
              createdAt: { gte: monthStart },
            },
            _sum: { costMicros: true },
          }),
          tx.aiGenerationRun.findMany({
            where: {
              tenantId: principal.tenantId,
              createdAt: { gte: monthStart },
              status: {
                in: [AiGenerationStatus.QUEUED, AiGenerationStatus.RUNNING],
              },
            },
            select: { budgetLimitMicros: true, costMicros: true },
          }),
        ]);
        const reservedMicros = active.reduce(
          (total, item) =>
            total +
            (item.budgetLimitMicros > item.costMicros
              ? item.budgetLimitMicros - item.costMicros
              : 0n),
          0n,
        );
        const budgetAvailable =
          (spent._sum.costMicros ?? 0n) + reservedMicros + runBudget <=
          monthlyBudget;
        const created = await tx.aiGenerationRun.create({
          data: {
            tenantId: principal.tenantId,
            clientId: note.clientId,
            noteId: note.id,
            kind: AiGenerationKind.NOTE_DRAFT,
            status: budgetAvailable
              ? AiGenerationStatus.QUEUED
              : AiGenerationStatus.BUDGET_BLOCKED,
            requestedById: principal.userId,
            baseVersion: note.currentVersion,
            provider: 'openai',
            model: this.provider.primaryModel,
            reasoningEffort: this.provider.reasoningEffort,
            inputSnapshot: snapshot,
            budgetLimitMicros: runBudget,
            pricingVersion: AI_PRICING_VERSION,
            ...(!budgetAvailable
              ? {
                  completedAt: new Date(),
                  errorCode: 'MONTHLY_BUDGET_EXCEEDED',
                  errorMessage:
                    'El presupuesto mensual disponible no permite reservar esta ejecución.',
                }
              : {}),
          },
        });
        let outboxJobId: string | null = null;
        if (budgetAvailable) {
          const claimed = await tx.noteDocument.updateMany({
            where: {
              id: note.id,
              tenantId: principal.tenantId,
              currentVersion: note.currentVersion,
              status: note.status,
            },
            data: { status: NoteStatus.GENERATING },
          });
          if (claimed.count !== 1) {
            throw new ConflictException(
              'La nota cambió antes de iniciar la generación.',
            );
          }
          const outbox = await tx.outboxJob.create({
            data: {
              tenantId: principal.tenantId,
              jobType: AI_GENERATION_JOB,
              aggregateType: 'ai_generation_run',
              aggregateId: created.id,
              payload: { runId: created.id, dispatchId: randomUUID() },
            },
          });
          outboxJobId = outbox.id;
        }
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: note.clientId,
            userId: principal.userId,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            actorType: AuditActorType.USER,
            action: budgetAvailable
              ? 'ai.note_generation.queued'
              : 'ai.note_generation.budget_blocked',
            entityType: 'ai_generation_run',
            entityId: created.id,
            metadata: {
              noteId: note.id,
              baseVersion: note.currentVersion,
              model: created.model,
              budgetLimitMicros: Number(runBudget),
              outboxJobId,
            },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.present(run);
  }

  async get(id: string, principal: AuthPrincipal) {
    const run = await this.prisma.aiGenerationRun.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        agentResults: { orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] },
        titleProposals: {
          select: {
            id: true,
            title: true,
            status: true,
            currentVersion: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        noteVersions: {
          select: { id: true, noteId: true, version: true, title: true },
        },
      },
    });
    if (!run) throw new NotFoundException('Ejecución editorial no encontrada.');
    const permission =
      run.kind === AiGenerationKind.NOTE_DRAFT ? 'notes.read' : 'titles.read';
    this.assertClientPermission(principal, 'ai.read', run.clientId);
    this.assertClientPermission(principal, permission, run.clientId);
    return this.present(run);
  }

  private async titleContext(clientId: string, tenantId: string) {
    const [client, history, activeRules, corrections] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id: clientId, tenantId, active: true },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.titleProposal.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          title: true,
          objective: true,
          searchIntent: true,
          focus: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.learningRule.findMany({
        where: {
          tenantId,
          status: LearningRuleStatus.ACTIVE,
          OR: [{ clientId }, { clientId: null }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, description: true },
      }),
      this.prisma.correctionSignal.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          field: true,
          beforeValue: true,
          afterValue: true,
          reason: true,
          correctionType: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      client,
      history: history.map((item) => ({
        ...item,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      activeRules,
      corrections: corrections.map((item) => ({
        ...item,
        correctionType: item.correctionType,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private async queueGenericRun(input: {
    tenantId: string;
    clientId: string;
    requestedById: string;
    principal: AuthPrincipal;
    kind: AiGenerationKind;
    snapshot: Prisma.InputJsonObject;
    titleProposalId?: string;
    campaignYear?: number;
    campaignMonth?: number;
    campaignTopic?: string;
    editorialFolderKey?: string;
    auditAction: string;
  }) {
    const runBudget = BigInt(
      this.config.getOrThrow<number>('AI_RUN_BUDGET_MICROS'),
    );
    const monthlyBudget = BigInt(
      this.config.getOrThrow<number>('AI_MONTHLY_BUDGET_MICROS'),
    );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ihere-ai-budget:${input.tenantId}`}))::text AS lock_result`;
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const [spent, active] = await Promise.all([
          tx.aiGenerationRun.aggregate({
            where: { tenantId: input.tenantId, createdAt: { gte: monthStart } },
            _sum: { costMicros: true },
          }),
          tx.aiGenerationRun.findMany({
            where: {
              tenantId: input.tenantId,
              createdAt: { gte: monthStart },
              status: {
                in: [AiGenerationStatus.QUEUED, AiGenerationStatus.RUNNING],
              },
            },
            select: { budgetLimitMicros: true, costMicros: true },
          }),
        ]);
        const reservedMicros = active.reduce(
          (total, item) =>
            total +
            (item.budgetLimitMicros > item.costMicros
              ? item.budgetLimitMicros - item.costMicros
              : 0n),
          0n,
        );
        const budgetAvailable =
          (spent._sum.costMicros ?? 0n) + reservedMicros + runBudget <=
          monthlyBudget;
        const created = await tx.aiGenerationRun.create({
          data: {
            tenantId: input.tenantId,
            clientId: input.clientId,
            titleProposalId: input.titleProposalId,
            kind: input.kind,
            status: budgetAvailable
              ? AiGenerationStatus.QUEUED
              : AiGenerationStatus.BUDGET_BLOCKED,
            requestedById: input.requestedById,
            provider: 'openai',
            model: this.provider.primaryModel,
            reasoningEffort: this.provider.reasoningEffort,
            inputSnapshot: input.snapshot,
            campaignYear: input.campaignYear,
            campaignMonth: input.campaignMonth,
            campaignTopic: input.campaignTopic,
            editorialFolderKey: input.editorialFolderKey,
            budgetLimitMicros: runBudget,
            pricingVersion: AI_PRICING_VERSION,
            ...(!budgetAvailable
              ? {
                  completedAt: new Date(),
                  errorCode: 'MONTHLY_BUDGET_EXCEEDED',
                  errorMessage:
                    'El presupuesto mensual disponible no permite reservar esta ejecución.',
                }
              : {}),
          },
        });
        let outboxJobId: string | null = null;
        if (budgetAvailable) {
          const outbox = await tx.outboxJob.create({
            data: {
              tenantId: input.tenantId,
              jobType: AI_GENERATION_JOB,
              aggregateType: 'ai_generation_run',
              aggregateId: created.id,
              payload: { runId: created.id, dispatchId: randomUUID() },
            },
          });
          outboxJobId = outbox.id;
        }
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            clientId: input.clientId,
            userId: input.requestedById,
            requestId: input.principal.requestId,
            ipAddress: input.principal.ipAddress,
            userAgent: input.principal.userAgent,
            actorType: AuditActorType.USER,
            action: budgetAvailable
              ? input.auditAction
              : `${input.auditAction}.budget_blocked`,
            entityType: 'ai_generation_run',
            entityId: created.id,
            metadata: {
              kind: input.kind,
              titleProposalId: input.titleProposalId ?? null,
              model: created.model,
              budgetLimitMicros: Number(runBudget),
              monthlyBudgetMicros: Number(monthlyBudget),
              outboxJobId,
            },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private folderKey(
    clientSlug: string,
    campaignYear: number,
    campaignMonth: number,
    topic: string,
  ) {
    const normalizedTopic = topic
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
    return `${clientSlug}/${campaignYear}/${String(campaignMonth).padStart(2, '0')}/${normalizedTopic || 'tema-editorial'}`;
  }

  private present<T extends Record<string, unknown>>(run: T) {
    const bigintKeys = ['costMicros', 'budgetLimitMicros'];
    const normalize = (value: unknown): unknown => {
      if (typeof value === 'bigint') return Number(value);
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            bigintKeys.includes(key) || typeof item === 'bigint'
              ? Number(item)
              : normalize(item),
          ]),
        );
      }
      return value;
    };
    const normalized = normalize(run) as Record<string, unknown>;
    delete normalized.inputSnapshot;
    return normalized;
  }

  private assertClientPermission(
    principal: AuthPrincipal,
    permission: string,
    clientId: string,
  ) {
    if (!hasPermission(principal, permission, clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }
}
