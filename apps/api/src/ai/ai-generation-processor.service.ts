import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  AgentType,
  AiGenerationKind,
  AiGenerationStatus,
  AuditActorType,
  ClientReviewLinkStatus,
  CorrectionType,
  EvaluationStatus,
  EvaluationVerdict,
  NoteImageStatus,
  NoteSourceType,
  NoteStatus,
  Prisma,
  TitleStatus,
  VersionSource,
} from '../generated/prisma/client';
import { TITLE_EVALUATION_JOB } from '../titles/title-evaluation-queue.service';
import { NOTE_QA_JOB } from '../notes/note-qa-queue.service';
import { NoteContentService } from '../notes/note-content.service';
import { resolveEditorialCta } from '../notes/editorial-cta';
import {
  stripTrackedUrlsFromValue,
  stripTrackingParameters,
} from '../common/url-hygiene';
import {
  noteAuditSchema,
  noteDraftSchema,
  noteGenerationSnapshotSchema,
  titleEditorialReviewSchema,
  titleBriefSnapshotSchema,
  finalizeTitleBriefSuggestion,
  titleBriefSuggestionSchema,
  titleGenerationSnapshotSchema,
  titleJudgeSchema,
  titleStrategySchema,
  titleRevisionOutputSchema,
  titleRevisionSnapshotSchema,
  type TitleBriefSuggestion,
  type TitleEditorialReviewOutput,
  type TitleGenerationSnapshot,
  type TitleJudgeOutput,
  type TitleStrategyOutput,
  type TitleRevisionOutput,
  type TitleRevisionSnapshot,
  type NoteAuditOutput,
  type NoteDraftOutput,
  type NoteGenerationSnapshot,
  noteGenerationHasClientFeedback,
  verifiedResearchFromCurrentDraft,
  webResearchRecordSchema,
  type WebResearchRecord,
} from './ai-generation.schemas';
import { AiPricingService, type AiUsage } from './ai-pricing.service';
import { shouldReuseInitialNoteShell } from './note-draft-version-policy';
import { OpenAiProviderService } from './openai-provider.service';

@Injectable()
export class AiGenerationProcessorService {
  private readonly logger = new Logger(AiGenerationProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAiProviderService,
    private readonly pricing: AiPricingService,
    private readonly config: ConfigService,
    private readonly content: NoteContentService,
  ) {}

  async process(runId: string, deadline: number) {
    const current = await this.prisma.aiGenerationRun.findUnique({
      where: { id: runId },
    });
    if (!current) throw new Error('La ejecución editorial no existe.');
    if (
      current.status === AiGenerationStatus.COMPLETED ||
      current.status === AiGenerationStatus.BUDGET_BLOCKED ||
      current.status === AiGenerationStatus.CANCELLED
    ) {
      return { runId, status: current.status };
    }
    const claimed = await this.prisma.aiGenerationRun.updateMany({
      where: { id: runId, status: AiGenerationStatus.QUEUED },
      data: {
        status: AiGenerationStatus.RUNNING,
        startedAt: current.startedAt ?? new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) {
      return { runId, status: 'already-running' };
    }
    switch (current.kind) {
      case AiGenerationKind.TITLE_BRIEF:
        return this.processTitleBrief(current, deadline);
      case AiGenerationKind.TITLE_PROPOSALS:
        return this.processTitles(current, deadline);
      case AiGenerationKind.TITLE_REVISION:
        return this.processTitleRevision(current, deadline);
      case AiGenerationKind.NOTE_DRAFT:
        return this.processNote(current, deadline);
    }
  }

  private async processTitleBrief(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      requestedById: string;
      inputSnapshot: Prisma.JsonValue;
      budgetLimitMicros: bigint;
    },
    deadline: number,
  ) {
    const snapshot = titleBriefSnapshotSchema.parse(run.inputSnapshot);
    const rawSuggestion = await this.stage<TitleBriefSuggestion>({
      run,
      deadline,
      sequence: 1,
      agentType: AgentType.SEO_STRATEGIST,
      stage: 'title-brief-suggestion-v1',
      schema: titleBriefSuggestionSchema,
      schemaName: 'ihere_title_brief_suggestion',
      system: this.briefSystem(),
      user: JSON.stringify(snapshot),
      maxOutputTokens: 2_500,
    });
    const suggestion = finalizeTitleBriefSuggestion(
      rawSuggestion,
      snapshot.request.searchIntent,
    );
    if (await this.isBudgetBlocked(run.id)) return this.blocked(run.id);
    await this.completeSimpleRun(run, {
      suggestion,
    });
    return { runId: run.id, status: AiGenerationStatus.COMPLETED, suggestion };
  }

  private async processTitleRevision(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      titleProposalId: string | null;
      requestedById: string;
      inputSnapshot: Prisma.JsonValue;
      budgetLimitMicros: bigint;
    },
    deadline: number,
  ) {
    if (!run.titleProposalId)
      throw new Error('La corrección no tiene un título objetivo válido.');
    const snapshot = titleRevisionSnapshotSchema.parse(run.inputSnapshot);
    const result = await this.stage<TitleRevisionOutput>({
      run,
      deadline,
      sequence: 1,
      agentType: AgentType.BRAND_EDITOR,
      stage: 'title-client-feedback-revision-v1',
      schema: titleRevisionOutputSchema,
      schemaName: 'ihere_title_revision',
      system: this.revisionSystem(),
      user: JSON.stringify(snapshot),
      maxOutputTokens: 3_500,
    });
    if (await this.isBudgetBlocked(run.id)) return this.blocked(run.id);
    return this.persistTitleRevision(
      { ...run, titleProposalId: run.titleProposalId },
      snapshot,
      result,
    );
  }

  private async processNote(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      noteId: string | null;
      requestedById: string;
      baseVersion: number | null;
      inputSnapshot: Prisma.JsonValue;
      budgetLimitMicros: bigint;
    },
    deadline: number,
  ) {
    if (!run.noteId || !run.baseVersion)
      throw new Error('La ejecución de nota no tiene una versión base válida.');
    const snapshot = noteGenerationSnapshotSchema.parse(run.inputSnapshot);
    const research = await this.researchStage(run, snapshot, deadline);
    if (await this.isBudgetBlocked(run.id)) {
      await this.restoreNoteAfterBlockedRun(run);
      return this.blocked(run.id);
    }
    const draft = await this.stage<NoteDraftOutput>({
      run,
      deadline,
      sequence: 2,
      agentType: AgentType.BRAND_EDITOR,
      stage: 'note-writer-v1',
      schema: noteDraftSchema,
      schemaName: 'ihere_note_draft',
      system: this.noteWriterSystem(),
      user: JSON.stringify({ snapshot, research }),
      maxOutputTokens: 10_000,
    });
    if (await this.isBudgetBlocked(run.id)) {
      await this.restoreNoteAfterBlockedRun(run);
      return this.blocked(run.id);
    }
    const audit = await this.stage<NoteAuditOutput>({
      run,
      deadline,
      sequence: 3,
      agentType: AgentType.GEO_AEO_AUDITOR,
      stage: 'note-geo-aeo-audit-v1',
      schema: noteAuditSchema,
      schemaName: 'ihere_note_geo_aeo_audit',
      system: this.noteAuditSystem(),
      user: JSON.stringify({ snapshot, research, draft }),
      maxOutputTokens: 10_000,
    });
    if (await this.isBudgetBlocked(run.id)) {
      await this.restoreNoteAfterBlockedRun(run);
      return this.blocked(run.id);
    }
    const result = await this.persistNoteDraft(run, snapshot, research, audit);
    this.logger.log(
      `Generación ${run.id} creó la versión ${result.version} de la nota ${run.noteId}.`,
    );
    return { runId: run.id, status: AiGenerationStatus.COMPLETED, ...result };
  }

  private async processTitles(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      requestedById: string;
      inputSnapshot: Prisma.JsonValue;
      budgetLimitMicros: bigint;
    },
    deadline: number,
  ) {
    const snapshot = titleGenerationSnapshotSchema.parse(run.inputSnapshot);
    const strategy = await this.stage<TitleStrategyOutput>({
      run,
      deadline,
      sequence: 1,
      agentType: AgentType.SEO_STRATEGIST,
      stage: 'title-strategy-v1',
      schema: titleStrategySchema,
      schemaName: 'ihere_title_strategy',
      system: this.strategySystem(),
      user: this.stageInput(snapshot),
    });
    if (await this.isBudgetBlocked(run.id)) return this.blocked(run.id);

    const review = await this.stage<TitleEditorialReviewOutput>({
      run,
      deadline,
      sequence: 2,
      agentType: AgentType.BRAND_EDITOR,
      stage: 'title-editorial-review-v1',
      schema: titleEditorialReviewSchema,
      schemaName: 'ihere_title_editorial_review',
      system: this.reviewSystem(),
      user: JSON.stringify({
        client: snapshot.client,
        request: snapshot.request,
        activeRules: snapshot.activeRules,
        corrections: snapshot.corrections,
        strategy,
      }),
    });
    if (await this.isBudgetBlocked(run.id)) return this.blocked(run.id);

    const judged = await this.stage<TitleJudgeOutput>({
      run,
      deadline,
      sequence: 3,
      agentType: AgentType.JUDGE,
      stage: 'title-judge-v1',
      schema: titleJudgeSchema,
      schemaName: 'ihere_title_judge',
      system: this.judgeSystem(),
      user: JSON.stringify({
        client: snapshot.client,
        request: snapshot.request,
        history: snapshot.history,
        activeRules: snapshot.activeRules,
        editorialReview: review,
      }),
    });
    if (await this.isBudgetBlocked(run.id)) return this.blocked(run.id);

    const candidates = this.uniqueCandidates(judged, snapshot);
    const result = await this.persistTitleCandidates(
      run,
      snapshot,
      judged,
      candidates,
    );
    this.logger.log(
      `Generación ${run.id} creó ${result.proposalIds.length} títulos evaluables.`,
    );
    return { runId: run.id, status: AiGenerationStatus.COMPLETED, ...result };
  }

  private async stage<T>(input: {
    run: {
      id: string;
      tenantId: string;
      requestedById: string;
      budgetLimitMicros: bigint;
    };
    deadline: number;
    sequence: number;
    agentType: AgentType;
    stage: string;
    schema: Parameters<OpenAiProviderService['structured']>[0]['schema'];
    schemaName: string;
    system: string;
    user: string;
    maxOutputTokens?: number;
  }): Promise<T> {
    const existing = await this.prisma.aiAgentResult.findUnique({
      where: {
        runId_agentType_sequence: {
          runId: input.run.id,
          agentType: input.agentType,
          sequence: input.sequence,
        },
      },
    });
    if (
      existing?.status === AiGenerationStatus.COMPLETED &&
      existing.structuredOutput
    ) {
      return input.schema.parse(existing.structuredOutput) as T;
    }
    const maxOutputTokens = input.maxOutputTokens ?? 4_000;
    await this.assertStageBudget(input.run, {
      inputTokens: this.inputTokenUpperBound(input.system, input.user),
      cachedInputTokens: 0,
      outputTokens: maxOutputTokens,
      webSearchCalls: 0,
    });
    const startedAt = Date.now();
    const response = await this.provider.structured({
      schema: input.schema,
      schemaName: input.schemaName,
      system: input.system,
      user: input.user,
      runId: input.run.id,
      stage: input.stage,
      tenantId: input.run.tenantId,
      userId: input.run.requestedById,
      deadline: input.deadline,
      maxOutputTokens,
    });
    const durationMs = Math.max(0, Date.now() - startedAt);
    const costMicros = this.pricing.calculateMicros(
      this.provider.primaryModel,
      response.usage,
    );
    const summary = this.summaryFrom(response.output);
    await this.prisma.$transaction(async (tx) => {
      await tx.aiAgentResult.upsert({
        where: {
          runId_agentType_sequence: {
            runId: input.run.id,
            agentType: input.agentType,
            sequence: input.sequence,
          },
        },
        update: {
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary,
          findings: this.findingsFrom(response.output),
          evidence: { responseId: response.responseId, stage: input.stage },
          structuredOutput: response.output as Prisma.InputJsonValue,
          provider: 'openai',
          model: this.provider.primaryModel,
          reasoningEffort: this.provider.reasoningEffort,
          ...this.usageData(response.usage, costMicros),
          durationMs,
          errorCode: null,
        },
        create: {
          runId: input.run.id,
          agentType: input.agentType,
          sequence: input.sequence,
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary,
          findings: this.findingsFrom(response.output),
          evidence: { responseId: response.responseId, stage: input.stage },
          structuredOutput: response.output as Prisma.InputJsonValue,
          provider: 'openai',
          model: this.provider.primaryModel,
          reasoningEffort: this.provider.reasoningEffort,
          ...this.usageData(response.usage, costMicros),
          durationMs,
        },
      });
      await tx.aiGenerationRun.update({
        where: { id: input.run.id },
        data: {
          inputTokens: { increment: response.usage.inputTokens },
          cachedInputTokens: { increment: response.usage.cachedInputTokens },
          outputTokens: { increment: response.usage.outputTokens },
          webSearchCalls: { increment: response.usage.webSearchCalls },
          costMicros: { increment: BigInt(costMicros) },
        },
      });
    });
    await this.blockIfOverBudget(input.run.id);
    return response.output as T;
  }

  private async persistTitleCandidates(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      requestedById: string;
    },
    snapshot: TitleGenerationSnapshot,
    judged: TitleJudgeOutput,
    candidates: TitleJudgeOutput['candidates'],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.titleProposal.findMany({
        where: { generationRunId: run.id },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (existing.length) {
        await tx.aiGenerationRun.update({
          where: { id: run.id },
          data: {
            status: AiGenerationStatus.COMPLETED,
            completedAt: new Date(),
            output: {
              proposalIds: existing.map((item) => item.id),
              summary: judged.summary,
              discarded: judged.discarded,
            },
          },
        });
        return { proposalIds: existing.map((item) => item.id) };
      }
      const proposalIds: string[] = [];
      for (const candidate of candidates) {
        const proposal = await tx.titleProposal.create({
          data: {
            tenantId: run.tenantId,
            clientId: run.clientId,
            generationRunId: run.id,
            title: candidate.title,
            canonicalTitle: this.canonicalize(candidate.title),
            objective: candidate.objective,
            audience: candidate.audience,
            searchIntent: candidate.searchIntent,
            focus: candidate.focus,
            opportunity: candidate.opportunity,
            risk: candidate.risk,
            status: TitleStatus.EVALUATING,
            createdById: run.requestedById,
            versions: {
              create: {
                version: 1,
                title: candidate.title,
                objective: candidate.objective,
                audience: candidate.audience,
                searchIntent: candidate.searchIntent,
                focus: candidate.focus,
                opportunity: candidate.opportunity,
                risk: candidate.risk,
                source: VersionSource.AI_ASSISTED,
                changeReason: `Propuesta generada por flujo controlado ${run.id}.`,
                createdById: run.requestedById,
              },
            },
          },
        });
        const evaluation = await tx.titleEvaluation.create({
          data: {
            proposalId: proposal.id,
            version: 1,
            status: EvaluationStatus.QUEUED,
            requestedById: run.requestedById,
          },
        });
        await tx.outboxJob.create({
          data: {
            tenantId: run.tenantId,
            jobType: TITLE_EVALUATION_JOB,
            aggregateType: 'title_evaluation',
            aggregateId: evaluation.id,
            payload: { evaluationId: evaluation.id },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: run.tenantId,
            clientId: run.clientId,
            userId: run.requestedById,
            actorType: AuditActorType.SERVICE,
            action: 'ai.title_proposal.created',
            entityType: 'title_proposal',
            entityId: proposal.id,
            metadata: {
              generationRunId: run.id,
              evaluationId: evaluation.id,
              model: this.provider.primaryModel,
            },
          },
        });
        proposalIds.push(proposal.id);
      }
      await tx.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          status: AiGenerationStatus.COMPLETED,
          completedAt: new Date(),
          output: {
            proposalIds,
            summary: judged.summary,
            discarded: judged.discarded,
            requestedCount: snapshot.request.count,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          userId: run.requestedById,
          actorType: AuditActorType.SERVICE,
          action: 'ai.title_generation.completed',
          entityType: 'ai_generation_run',
          entityId: run.id,
          after: { status: AiGenerationStatus.COMPLETED, proposalIds },
          metadata: { model: this.provider.primaryModel },
        },
      });
      return { proposalIds };
    });
  }

  private async persistTitleRevision(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      titleProposalId: string;
      requestedById: string;
    },
    snapshot: TitleRevisionSnapshot,
    result: TitleRevisionOutput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiGenerationRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, output: true },
      });
      if (existing.status === AiGenerationStatus.COMPLETED) {
        return {
          runId: run.id,
          status: AiGenerationStatus.COMPLETED,
          output: existing.output,
        };
      }
      const nextVersion = snapshot.proposal.version + 1;
      const claimed = await tx.titleProposal.updateMany({
        where: {
          id: run.titleProposalId,
          tenantId: run.tenantId,
          clientId: run.clientId,
          currentVersion: snapshot.proposal.version,
          status: {
            in: [TitleStatus.CHANGES_REQUESTED, TitleStatus.REJECTED],
          },
        },
        data: {
          title: result.revised.title,
          canonicalTitle: this.canonicalize(result.revised.title),
          objective: result.revised.objective,
          audience: result.revised.audience,
          searchIntent: result.revised.searchIntent,
          focus: result.revised.focus,
          opportunity: result.revised.opportunity,
          risk: result.revised.risk,
          currentVersion: nextVersion,
          status: TitleStatus.EVALUATING,
          duplicateScore: 0,
          duplicateOfId: null,
          approvedAt: null,
          approvedById: null,
        },
      });
      if (claimed.count !== 1) {
        throw new Error(
          'El título cambió antes de aplicar la corrección automatizada.',
        );
      }
      await tx.titleVersion.create({
        data: {
          proposalId: run.titleProposalId,
          version: nextVersion,
          title: result.revised.title,
          objective: result.revised.objective,
          audience: result.revised.audience,
          searchIntent: result.revised.searchIntent,
          focus: result.revised.focus,
          opportunity: result.revised.opportunity,
          risk: result.revised.risk,
          source: VersionSource.AI_ASSISTED,
          correctionType: CorrectionType.OTHER,
          changeReason: `Corrección solicitada por el cliente: ${snapshot.clientFeedback.reason}`,
          createdById: run.requestedById,
        },
      });
      const evaluation = await tx.titleEvaluation.create({
        data: {
          proposalId: run.titleProposalId,
          version: nextVersion,
          status: EvaluationStatus.QUEUED,
          requestedById: run.requestedById,
        },
      });
      await tx.outboxJob.create({
        data: {
          tenantId: run.tenantId,
          jobType: TITLE_EVALUATION_JOB,
          aggregateType: 'title_evaluation',
          aggregateId: evaluation.id,
          payload: { evaluationId: evaluation.id },
        },
      });
      await tx.titleReviewLink.updateMany({
        where: {
          proposalId: run.titleProposalId,
          status: ClientReviewLinkStatus.ACTIVE,
        },
        data: {
          status: ClientReviewLinkStatus.REVOKED,
          revokedAt: new Date(),
        },
      });
      const output: Prisma.InputJsonObject = {
        proposalId: run.titleProposalId,
        version: nextVersion,
        summary: result.summary,
        appliedFeedback: result.appliedFeedback,
      };
      await tx.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          status: AiGenerationStatus.COMPLETED,
          completedAt: new Date(),
          output,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          userId: run.requestedById,
          actorType: AuditActorType.SERVICE,
          action: 'ai.title_revision.completed',
          entityType: 'title_proposal',
          entityId: run.titleProposalId,
          before: {
            version: snapshot.proposal.version,
            status: snapshot.proposal.status,
            title: snapshot.proposal.title,
          },
          after: {
            version: nextVersion,
            status: TitleStatus.EVALUATING,
            title: result.revised.title,
          },
          metadata: {
            generationRunId: run.id,
            evaluationId: evaluation.id,
            feedback: snapshot.clientFeedback.reason,
          },
        },
      });
      return {
        runId: run.id,
        status: AiGenerationStatus.COMPLETED,
        output,
      };
    });
  }

  private async completeSimpleRun(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      requestedById: string;
    },
    output: Prisma.InputJsonObject,
  ) {
    await this.prisma.$transaction([
      this.prisma.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          status: AiGenerationStatus.COMPLETED,
          completedAt: new Date(),
          output,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          userId: run.requestedById,
          actorType: AuditActorType.SERVICE,
          action: 'ai.title_brief.completed',
          entityType: 'ai_generation_run',
          entityId: run.id,
          after: { status: AiGenerationStatus.COMPLETED },
        },
      }),
    ]);
  }

  private async researchStage(
    run: {
      id: string;
      tenantId: string;
      requestedById: string;
      budgetLimitMicros: bigint;
    },
    snapshot: NoteGenerationSnapshot,
    deadline: number,
  ): Promise<WebResearchRecord> {
    const existing = await this.prisma.aiAgentResult.findUnique({
      where: {
        runId_agentType_sequence: {
          runId: run.id,
          agentType: AgentType.RESEARCHER,
          sequence: 1,
        },
      },
    });
    if (
      existing?.status === AiGenerationStatus.COMPLETED &&
      existing.structuredOutput
    ) {
      return webResearchRecordSchema.parse(existing.structuredOutput);
    }
    const verifiedResearch = verifiedResearchFromCurrentDraft(snapshot);
    if (verifiedResearch) {
      await this.prisma.aiAgentResult.upsert({
        where: {
          runId_agentType_sequence: {
            runId: run.id,
            agentType: AgentType.RESEARCHER,
            sequence: 1,
          },
        },
        update: {
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary: `Se reutilizaron ${verifiedResearch.citations.length} fuentes verificadas de la versión observada.`,
          findings: {
            citationCount: verifiedResearch.citations.length,
            reusedVerifiedSources: true,
          },
          evidence: { stage: 'note-research-reuse-v1' },
          structuredOutput: verifiedResearch,
          provider: 'internal',
          model: 'verified-source-reuse',
          reasoningEffort: 'none',
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          webSearchCalls: 0,
          costMicros: 0,
          durationMs: 0,
          errorCode: null,
        },
        create: {
          runId: run.id,
          agentType: AgentType.RESEARCHER,
          sequence: 1,
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary: `Se reutilizaron ${verifiedResearch.citations.length} fuentes verificadas de la versión observada.`,
          findings: {
            citationCount: verifiedResearch.citations.length,
            reusedVerifiedSources: true,
          },
          evidence: { stage: 'note-research-reuse-v1' },
          structuredOutput: verifiedResearch,
          provider: 'internal',
          model: 'verified-source-reuse',
          reasoningEffort: 'none',
          durationMs: 0,
        },
      });
      return verifiedResearch;
    }
    await this.assertStageBudget(run, {
      inputTokens: this.inputTokenUpperBound(
        this.researchSystem(),
        JSON.stringify({
          client: snapshot.client,
          brief: snapshot.note.briefSnapshot,
          title: snapshot.note.currentTitle,
          activeRules: snapshot.activeRules,
          instructions: snapshot.request.additionalInstructions,
          clientFeedback: snapshot.clientFeedback,
          currentDraft: snapshot.clientFeedback
            ? snapshot.note.currentDraft
            : undefined,
        }),
      ),
      cachedInputTokens: 0,
      outputTokens: 4_000,
      webSearchCalls: 8,
    });
    const startedAt = Date.now();
    const response = await this.provider.webResearch({
      system: this.researchSystem(),
      user: JSON.stringify({
        client: snapshot.client,
        brief: snapshot.note.briefSnapshot,
        title: snapshot.note.currentTitle,
        activeRules: snapshot.activeRules,
        instructions: snapshot.request.additionalInstructions,
        clientFeedback: snapshot.clientFeedback,
        currentDraft: snapshot.clientFeedback
          ? snapshot.note.currentDraft
          : undefined,
      }),
      runId: run.id,
      stage: 'note-research-v1',
      tenantId: run.tenantId,
      userId: run.requestedById,
      deadline,
    });
    const record = webResearchRecordSchema.parse({
      text: response.text,
      citations: response.citations,
    });
    const costMicros = this.pricing.calculateMicros(
      this.provider.primaryModel,
      response.usage,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.aiAgentResult.upsert({
        where: {
          runId_agentType_sequence: {
            runId: run.id,
            agentType: AgentType.RESEARCHER,
            sequence: 1,
          },
        },
        update: {
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary: `Investigación completada con ${record.citations.length} fuentes citables.`,
          findings: {
            citationCount: record.citations.length,
            domains: record.citations.map(
              (source) => new URL(source.url).hostname,
            ),
          },
          evidence: {
            responseId: response.responseId,
            stage: 'note-research-v1',
          },
          structuredOutput: record,
          provider: 'openai',
          model: this.provider.primaryModel,
          reasoningEffort: this.provider.reasoningEffort,
          ...this.usageData(response.usage, costMicros),
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: null,
        },
        create: {
          runId: run.id,
          agentType: AgentType.RESEARCHER,
          sequence: 1,
          status: AiGenerationStatus.COMPLETED,
          verdict: EvaluationVerdict.PASS,
          summary: `Investigación completada con ${record.citations.length} fuentes citables.`,
          findings: {
            citationCount: record.citations.length,
            domains: record.citations.map(
              (source) => new URL(source.url).hostname,
            ),
          },
          evidence: {
            responseId: response.responseId,
            stage: 'note-research-v1',
          },
          structuredOutput: record,
          provider: 'openai',
          model: this.provider.primaryModel,
          reasoningEffort: this.provider.reasoningEffort,
          ...this.usageData(response.usage, costMicros),
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
      await tx.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          inputTokens: { increment: response.usage.inputTokens },
          cachedInputTokens: { increment: response.usage.cachedInputTokens },
          outputTokens: { increment: response.usage.outputTokens },
          webSearchCalls: { increment: response.usage.webSearchCalls },
          costMicros: { increment: BigInt(costMicros) },
        },
      });
    });
    await this.blockIfOverBudget(run.id);
    return record;
  }

  private async persistNoteDraft(
    run: {
      id: string;
      tenantId: string;
      clientId: string;
      noteId: string | null;
      requestedById: string;
      baseVersion: number | null;
    },
    snapshot: NoteGenerationSnapshot,
    research: WebResearchRecord,
    audit: NoteAuditOutput,
  ) {
    if (!run.noteId || !run.baseVersion)
      throw new Error('La generación no tiene nota o versión base.');
    const noteId = run.noteId;
    const baseVersion = run.baseVersion;
    const cleanDraft = stripTrackedUrlsFromValue(audit.revisedDraft);
    const validatedContent = this.content.validate(cleanDraft.content);
    const client = await this.prisma.client.findUnique({
      where: { id: run.clientId },
      select: { slug: true },
    });
    if (!client) throw new Error('El cliente de la nota no existe.');
    const resolvedCta = resolveEditorialCta(client.slug, {
      ctaText: cleanDraft.ctaText,
      ctaUrl: cleanDraft.ctaUrl
        ? stripTrackingParameters(cleanDraft.ctaUrl)
        : null,
    });
    const cleanCitations = [
      ...new Map(
        research.citations.map((source) => {
          const url = stripTrackingParameters(source.url);
          return [url, { ...source, url }];
        }),
      ).values(),
    ];
    const requestedUrls = new Set(cleanDraft.sourceUrlsUsed);
    const sources = cleanCitations.filter((source) =>
      requestedUrls.has(source.url),
    );
    const verifiedSources = sources.length ? sources : cleanCitations;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.noteVersion.findFirst({
        where: { generationRunId: run.id },
        select: { id: true, version: true },
      });
      if (existing) {
        await tx.aiGenerationRun.update({
          where: { id: run.id },
          data: {
            status: AiGenerationStatus.COMPLETED,
            completedAt: new Date(),
            output: {
              noteId,
              noteVersionId: existing.id,
              version: existing.version,
            },
          },
        });
        return { noteVersionId: existing.id, version: existing.version };
      }
      const initialShell = await tx.noteVersion.findUnique({
        where: { noteId_version: { noteId, version: baseVersion } },
        select: {
          version: true,
          source: true,
          wordCount: true,
          generationRunId: true,
        },
      });
      const reusedInitialShell = shouldReuseInitialNoteShell(initialShell);
      const nextVersion = reusedInitialShell ? baseVersion : baseVersion + 1;
      const claimed = await tx.noteDocument.updateMany({
        where: {
          id: noteId,
          tenantId: run.tenantId,
          currentVersion: baseVersion,
          status: NoteStatus.GENERATING,
        },
        data: { currentVersion: nextVersion, status: NoteStatus.QA_QUEUED },
      });
      if (claimed.count !== 1) {
        throw new Error(
          'La nota cambió durante la generación y el borrador no puede aplicarse.',
        );
      }
      const versionData = {
        title: cleanDraft.title,
        metaTitle: cleanDraft.metaTitle,
        metaDescription: cleanDraft.metaDescription,
        slug: cleanDraft.slug,
        excerpt: cleanDraft.excerpt,
        content: validatedContent,
        wordCount: this.content.wordCount(validatedContent),
        contentHash: this.content.hash(validatedContent),
        source: VersionSource.AI_ASSISTED,
        correctionType: snapshot.clientFeedback ? CorrectionType.OTHER : null,
        changeReason: snapshot.clientFeedback
          ? `Corrección solicitada por el cliente: ${snapshot.clientFeedback.reason}`
          : `Borrador generado por flujo controlado ${run.id}.`,
        authorName: cleanDraft.authorName,
        authorRole: cleanDraft.authorRole,
        ctaText: resolvedCta.ctaText,
        ctaUrl: resolvedCta.ctaUrl,
        internalLinks: [
          ...new Set(
            cleanDraft.internalLinks.map((url) => stripTrackingParameters(url)),
          ),
        ],
        createdById: run.requestedById,
        generationRunId: run.id,
      };
      const sourceData = verifiedSources.map((source) => ({
        type: this.sourceType(source.url),
        title: source.title,
        entity: this.sourceEntity(source.url),
        url: source.url,
        accessedAt: new Date(),
      }));
      const version = reusedInitialShell
        ? await tx.noteVersion.update({
            where: { noteId_version: { noteId, version: nextVersion } },
            data: {
              ...versionData,
              sources: {
                deleteMany: {},
                create: sourceData,
              },
            },
          })
        : await tx.noteVersion.create({
            data: {
              noteId,
              version: nextVersion,
              ...versionData,
              sources: {
                create: sourceData,
              },
            },
          });
      const imageProposal = cleanDraft.imageProposal ?? {
        concept: `Imagen editorial que represente ${cleanDraft.title} mediante una escena laboral peruana realista y profesional.`,
        prompt: `Fotografía editorial horizontal, luminosa y natural sobre ${cleanDraft.title}. Mostrar personas adultas en un entorno de trabajo peruano verosímil, con diversidad, gestos espontáneos y composición limpia. Evitar texto incrustado, logotipos inventados, poses publicitarias, estereotipos y elementos que prometan resultados no sustentados.`,
        altText: cleanDraft.title.slice(0, 320),
        caption: null,
        referenceUrl: null,
      };
      await tx.noteImageProposal.upsert({
        where: { noteId_version: { noteId, version: nextVersion } },
        create: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          noteId,
          version: nextVersion,
          concept: imageProposal.concept,
          prompt: imageProposal.prompt,
          altText: imageProposal.altText,
          caption: imageProposal.caption,
          referenceUrl: imageProposal.referenceUrl
            ? stripTrackingParameters(imageProposal.referenceUrl)
            : null,
          status: NoteImageStatus.PROPOSED,
          createdById: run.requestedById,
        },
        update: {
          concept: imageProposal.concept,
          prompt: imageProposal.prompt,
          altText: imageProposal.altText,
          caption: imageProposal.caption,
          referenceUrl: imageProposal.referenceUrl
            ? stripTrackingParameters(imageProposal.referenceUrl)
            : null,
          status: NoteImageStatus.PROPOSED,
          decisionReason: null,
          approvedById: null,
          approvedAt: null,
        },
      });
      const evaluation = await tx.noteQaEvaluation.create({
        data: {
          noteId,
          version: nextVersion,
          requestedById: run.requestedById,
        },
      });
      await tx.outboxJob.create({
        data: {
          tenantId: run.tenantId,
          jobType: NOTE_QA_JOB,
          aggregateType: 'note_qa_evaluation',
          aggregateId: evaluation.id,
          payload: { evaluationId: evaluation.id },
        },
      });
      await tx.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          status: AiGenerationStatus.COMPLETED,
          completedAt: new Date(),
          output: {
            noteId,
            noteVersionId: version.id,
            version: nextVersion,
            sourceCount: verifiedSources.length,
            auditScore: audit.score,
            researchSourceCount: cleanCitations.length,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          userId: run.requestedById,
          actorType: AuditActorType.SERVICE,
          action: 'ai.note_generation.completed',
          entityType: 'note_document',
          entityId: noteId,
          before: { version: baseVersion, status: NoteStatus.GENERATING },
          after: { version: nextVersion, status: NoteStatus.QA_QUEUED },
          metadata: {
            generationRunId: run.id,
            evaluationId: evaluation.id,
            sourceCount: verifiedSources.length,
            auditScore: audit.score,
            reusedInitialShell,
          },
        },
      });
      return { noteVersionId: version.id, version: nextVersion };
    });
  }

  async recordFailure(
    runId: string,
    error: Error,
    finalAttempt: boolean,
    attempt: number,
  ) {
    const run = await this.prisma.aiGenerationRun.findUnique({
      where: { id: runId },
    });
    if (!run) return;
    if (run.status === AiGenerationStatus.BUDGET_BLOCKED) {
      if (run.kind === AiGenerationKind.NOTE_DRAFT) {
        await this.restoreNoteAfterBlockedRun(run);
      }
      return;
    }
    if (
      run.status === AiGenerationStatus.COMPLETED ||
      run.status === AiGenerationStatus.CANCELLED
    ) {
      return;
    }
    const message = this.sanitizeError(error.message).slice(0, 2_000);
    await this.prisma.$transaction([
      this.prisma.aiGenerationRun.update({
        where: { id: runId },
        data: {
          status: finalAttempt
            ? AiGenerationStatus.FAILED
            : AiGenerationStatus.QUEUED,
          errorCode: finalAttempt ? 'GENERATION_FAILED' : 'RETRY_SCHEDULED',
          errorMessage: finalAttempt
            ? message
            : `El intento ${attempt} falló y será reintentado.`,
          completedAt: finalAttempt ? new Date() : null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: run.tenantId,
          clientId: run.clientId,
          userId: run.requestedById,
          actorType: AuditActorType.SERVICE,
          action: finalAttempt
            ? 'ai.generation.failed'
            : 'ai.generation.retry_scheduled',
          entityType: 'ai_generation_run',
          entityId: runId,
          metadata: { attempt, error: message },
        },
      }),
    ]);
    if (finalAttempt && run.kind === AiGenerationKind.NOTE_DRAFT) {
      await this.restoreNoteAfterBlockedRun(run);
    }
  }

  private uniqueCandidates(
    judged: TitleJudgeOutput,
    snapshot: TitleGenerationSnapshot,
  ) {
    const seen = new Set<string>();
    const historical = new Set(
      snapshot.history.map((item) => this.canonicalize(item.title)),
    );
    const candidates = judged.candidates
      .filter((item) => {
        const canonical = this.canonicalize(item.title);
        if (!canonical || seen.has(canonical) || historical.has(canonical))
          return false;
        seen.add(canonical);
        return true;
      })
      .slice(0, snapshot.request.count);
    if (candidates.length < snapshot.request.count) {
      throw new Error(
        `El control editorial no produjo las ${snapshot.request.count} alternativas nuevas y distintas solicitadas. Ajusta el encargo para ampliar la oportunidad temática.`,
      );
    }
    return candidates;
  }

  private async assertStageBudget(
    run: {
      id: string;
      budgetLimitMicros: bigint;
    },
    reservation: AiUsage,
  ) {
    const current = await this.prisma.aiGenerationRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { costMicros: true },
    });
    const worstCaseNextStage = BigInt(
      this.pricing.calculateMicros(this.provider.primaryModel, reservation),
    );
    if (current.costMicros + worstCaseNextStage > run.budgetLimitMicros) {
      await this.prisma.aiGenerationRun.update({
        where: { id: run.id },
        data: {
          status: AiGenerationStatus.BUDGET_BLOCKED,
          completedAt: new Date(),
          errorCode: 'RUN_BUDGET_RESERVATION_FAILED',
          errorMessage:
            'El presupuesto restante no alcanza para reservar la siguiente etapa.',
        },
      });
      throw new Error('La siguiente etapa excedería el presupuesto reservado.');
    }
  }

  private inputTokenUpperBound(...parts: string[]) {
    return (
      parts.reduce(
        (total, part) => total + Buffer.byteLength(part, 'utf8'),
        0,
      ) + 8_000
    );
  }

  private async blockIfOverBudget(runId: string) {
    const after = await this.prisma.aiGenerationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { costMicros: true, budgetLimitMicros: true },
    });
    if (after.costMicros > after.budgetLimitMicros) {
      await this.prisma.aiGenerationRun.update({
        where: { id: runId },
        data: {
          status: AiGenerationStatus.BUDGET_BLOCKED,
          completedAt: new Date(),
          errorCode: 'RUN_BUDGET_EXCEEDED',
          errorMessage:
            'La ejecución consumió el presupuesto máximo antes de completar todas las etapas.',
        },
      });
    }
  }

  private async restoreNoteAfterBlockedRun(run: {
    noteId: string | null;
    baseVersion: number | null;
    tenantId: string;
    inputSnapshot?: Prisma.JsonValue;
  }) {
    if (!run.noteId || !run.baseVersion) return;
    await this.prisma.noteDocument.updateMany({
      where: {
        id: run.noteId,
        tenantId: run.tenantId,
        currentVersion: run.baseVersion,
        status: NoteStatus.GENERATING,
      },
      data: {
        status: noteGenerationHasClientFeedback(run.inputSnapshot)
          ? NoteStatus.CHANGES_REQUESTED
          : NoteStatus.DRAFT,
      },
    });
  }

  private async isBudgetBlocked(runId: string) {
    const run = await this.prisma.aiGenerationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true },
    });
    return run.status === AiGenerationStatus.BUDGET_BLOCKED;
  }

  private blocked(runId: string) {
    return { runId, status: AiGenerationStatus.BUDGET_BLOCKED };
  }

  private usageData(usage: AiUsage, costMicros: number) {
    return {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      webSearchCalls: usage.webSearchCalls,
      costMicros: BigInt(costMicros),
    };
  }

  private stageInput(snapshot: TitleGenerationSnapshot) {
    return JSON.stringify(snapshot);
  }

  private summaryFrom(output: unknown): string {
    if (output && typeof output === 'object' && 'summary' in output) {
      const summary = (output as { summary?: unknown }).summary;
      if (typeof summary === 'string') return summary.slice(0, 2_000);
    }
    return 'Etapa completada con salida estructurada.';
  }

  private findingsFrom(output: unknown): Prisma.InputJsonValue {
    if (output && typeof output === 'object' && 'candidates' in output) {
      const candidates = (output as { candidates?: unknown }).candidates;
      if (Array.isArray(candidates)) {
        return {
          candidateCount: candidates.length,
          reviewedScores: candidates
            .map((item) =>
              item && typeof item === 'object' && 'score' in item
                ? (item as { score?: unknown }).score
                : null,
            )
            .filter((value): value is number => typeof value === 'number'),
        };
      }
    }
    return { outputValidated: true };
  }

  private strategySystem() {
    return [
      'Eres el estratega SEO, GEO y AEO de I HERE.',
      'Propón títulos editoriales naturales en español peruano para el cliente indicado.',
      'Usa el historial para evitar repetición temática y aplica solo las reglas activas.',
      'Respeta literalmente los nombres de servicios y términos de marca definidos en las reglas activas; no inventes categorías paraguas ni sinónimos comerciales.',
      'Dentro de un mismo lote, diferencia cada propuesta por línea de servicio, problema de negocio, intención y decisión del lector; no presentes paráfrasis del mismo artículo.',
      'Los títulos deben ser descriptivos, concisos, útiles y sostenibles con evidencia; evita relleno, alarmismo, promesas absolutas y acumulación artificial de palabras clave.',
      'Las correcciones históricas son señales, no órdenes permanentes salvo que exista una regla activa.',
      'No inventes datos, estudios, cifras ni respaldo de fuentes.',
      'Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private briefSystem() {
    return [
      'Eres director de estrategia editorial SEO, GEO y AEO para Adecco Perú dentro de I HERE.',
      'Prepara un encargo nuevo, profundo y completamente editable para el mes solicitado.',
      'La intención indicada en request.searchIntent fue elegida por una persona: respétala literalmente y no la sustituyas por otra.',
      'Contrasta todo el historial del cliente: no repitas el mismo tema, pregunta, intención, enfoque ni decisión del lector, aunque cambien las palabras.',
      'Rota de forma razonada entre estos pilares cuando correspondan a las reglas activas: atracción y selección; outsourcing y operaciones; payroll y cumplimiento; training y consulting; sales y marketing.',
      'El objetivo debe indicar qué comprenderá, comparará o decidirá el lector. El contexto debe precisar servicio, problema de negocio, ángulo, evidencia necesaria, límites y temas que conviene evitar.',
      'Redacta additionalContext en 500 a 800 caracteres y differentiation en 220 a 360 caracteres. Termina ambos campos con frases completas y puntuación final; nunca cortes una palabra, una enumeración ni una idea para alcanzar el máximo permitido.',
      'Prioriza una necesidad empresarial real en Perú, una oportunidad diferenciada y una promesa que pueda sostenerse después con fuentes primarias y experiencia autorizada.',
      'No inventes normas, cifras, estudios, servicios, metodologías ni experiencia de Adecco. Si el historial agota un ángulo, cambia de pilar o de intención.',
      'Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private revisionSystem() {
    return [
      'Eres el editor senior responsable de corregir una propuesta de título observada o rechazada por el cliente.',
      'Aplica íntegramente el motivo registrado, sin ignorarlo ni maquillarlo con una paráfrasis superficial.',
      'Devuelve una versión nueva con título, objetivo, público, intención, enfoque, oportunidad y riesgo coherentes entre sí.',
      'Mantén la temática y el cupo editorial del paquete, pero cambia el ángulo cuando la observación lo exija.',
      'Contrasta el historial para evitar equivalencias temáticas, canibalización y repetición dentro del cliente.',
      'Aplica solo reglas activas; no inventes datos, servicios, resultados, normas, fuentes ni experiencia atribuida a Adecco.',
      'La propuesta corregida debe poder desarrollarse después con SEO, GEO, AEO, evidencia verificable, respuesta temprana y revisión humana.',
      'Explica en appliedFeedback qué partes del comentario fueron resueltas, sin mostrar razonamiento privado.',
      'Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private reviewSystem() {
    return [
      'Eres el editor de marca de I HERE.',
      'Revisa cada propuesta por claridad, naturalidad, intención, diferenciación y utilidad.',
      'Comprueba que el nombre del servicio coincida con las reglas activas y que el lote no concentre todos los títulos en una sola solución o ángulo.',
      'Corrige redacción robótica, promesas exageradas, repetición y fórmulas genéricas.',
      'Conserva objetivo, público e intención y entrega hallazgos verificables, no razonamiento privado.',
      'Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private judgeSystem() {
    return [
      'Eres el juez editorial final de I HERE.',
      'Selecciona y mejora las mejores propuestas del editor.',
      'Descarta coincidencias exactas o equivalentes al historial y evita canibalización evidente.',
      'No apruebes afirmaciones factuales que el título no pueda sostener después con fuentes.',
      'Entrega exactamente la cantidad solicitada: cuatro, cinco u ocho alternativas únicas según el encargo.',
      'Devuelve conclusiones y evidencia estructurada, no razonamiento privado.',
    ].join(' ');
  }

  private researchSystem() {
    return [
      'Eres el investigador editorial de I HERE.',
      'Busca información actual y verificable para sostener la nota, priorizando organismos públicos, normas, estudios originales y documentación institucional.',
      'Usa las reglas activas para reconocer terminología oficial y asuntos que exigen revisión especializada, pero no conviertas una regla interna en evidencia factual.',
      'Distingue hechos de recomendaciones y conserva fechas, alcance y contexto.',
      'Cuando el tema trate regulación, intermediación laboral, cumplimiento o promesas de desempeño, reúne fuentes primarias suficientes y señala los límites de lo que realmente puede afirmarse.',
      'No inventes cifras ni fuentes. Toda afirmación factual importante debe quedar respaldada por una cita web real.',
      'Entrega una síntesis útil para el redactor y evita copiar fragmentos extensos.',
    ].join(' ');
  }

  private noteWriterSystem() {
    return [
      'Eres el redactor editorial SEO, GEO y AEO de I HERE.',
      'Redacta en español peruano natural, profesional y útil, con respuesta temprana, jerarquía clara y orientación a la acción.',
      'Abre con una tensión, pregunta o decisión real del lector y entrega valor concreto en los primeros dos párrafos; evita introducciones genéricas como “en un mundo cambiante”, el clickbait y las promesas grandilocuentes.',
      'Escribe con ritmo humano: alterna la longitud de las oraciones, usa transiciones naturales, ejemplos concretos y párrafos enfocados; no repitas la misma idea con palabras distintas ni uses fórmulas mecánicas entre secciones.',
      'Construye una nota sustancial: desarrolla el problema, explica criterios o pasos, incorpora al menos un ejemplo o escenario de decisión y cierra con una síntesis útil; no uses la conclusión para repetir la introducción.',
      'Si clientFeedback está presente, trabaja como una corrección de la versión vigente: cumple exactamente la observación, conserva lo que siga siendo válido y no introduzcas cambios ajenos al pedido sin una razón editorial verificable.',
      'Cada encabezado debe ayudar a aprender, comparar, decidir o actuar. Cuando sea natural, formula respuestas breves que puedan entenderse fuera de contexto sin perder entidad, alcance o fuente.',
      'Aplica literalmente las reglas activas del cliente durante toda la nota, en especial la terminología de servicios, la voz de marca y el equilibrio entre tecnología y criterio humano; un descargo aislado al final no corrige un enfoque contrario a la marca.',
      'Usa únicamente los hechos y URLs contenidos en la investigación proporcionada; no inventes datos, enlaces, especialistas ni experiencia interna del cliente.',
      'Incluye referencias naturales cerca de la afirmación que respaldan y selecciona en sourceUrlsUsed solo URLs exactas de la investigación.',
      'Devuelve internalLinks usando solo URLs exactas presentes en la investigación; si no existe una URL pertinente, usa una lista vacía. En una corrección conserva los enlaces ya verificados de currentDraft salvo que la observación pida cambiarlos.',
      'Para Adecco Perú, el CTA final debe invitar explícitamente a contactar a un especialista y ctaUrl debe ser exactamente https://www.adecco.com/es-pe/contactanos; esta URL institucional está autorizada. Para otros clientes, usa en ctaUrl solo una URL exacta de la investigación o null.',
      'Diferencia con claridad los hechos respaldados, la interpretación editorial y las recomendaciones prácticas. Solo atribuye una metodología, dato o experiencia a Adecco cuando la investigación lo sustente expresamente.',
      'No prometas resultados garantizados ni cumplimiento absoluto. Toda afirmación legal, normativa o de desempeño debe conservar alcance, condiciones y fuente primaria; si la evidencia no basta, omítela o preséntala como un punto que requiere validación humana especializada.',
      'El contenido debe tener normalmente entre 1200 y 1800 palabras cuando la complejidad del tema lo justifique, por exigencia editorial de este flujo y no porque un buscador premie una cantidad fija. Prioriza cobertura real sobre relleno, usa bloques con identificadores únicos, encabezados descriptivos y un CTA prudente sin URL inventada.',
      'Propón también una imagen editorial coherente con el contenido: concepto visual, prompt de producción, texto alternativo descriptivo y, solo si la investigación contiene una referencia visual pertinente, su URL exacta. La imagen no debe incluir texto incrustado, logotipos inventados, estereotipos ni promesas visuales engañosas.',
      'No uses frases sobre haber sido generado por IA. Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private noteAuditSystem() {
    return [
      'Eres el auditor GEO, AEO y de calidad editorial de I HERE.',
      'Revisa citabilidad, intención, naturalidad, precisión, estructura, posibles promesas exageradas y coherencia entre título, metadatos y contenido.',
      'Comprueba que el inicio capte una necesidad real y responda temprano, que no haya frases de relleno, clichés, párrafos intercambiables, repeticiones mecánicas ni saltos de tono.',
      'Si clientFeedback está presente, verifica de forma explícita que la versión revisada resuelva esa observación sin degradar precisión, estructura, fuentes ni intención.',
      'Verifica que las reglas activas se apliquen en todo el texto, que los servicios conserven su nombre oficial y que la tecnología no sustituya indebidamente el criterio humano cuando la marca exige ese equilibrio.',
      'Exige que cada afirmación factual relevante conserve cerca su entidad y fuente, y que las recomendaciones se distingan de los hechos.',
      'Bloquea garantías de cumplimiento, resultados absolutos y afirmaciones regulatorias sin fuente primaria o sin límites explícitos.',
      'Corrige el borrador completo sin agregar hechos o URLs que no aparezcan en la investigación.',
      'Conserva normalmente entre 1200 y 1800 palabras cuando la complejidad lo justifique, sin inflar el texto; exige profundidad, un ejemplo o escenario concreto y una conclusión que ayude a decidir. Elimina afirmaciones no respaldadas y devuelve hallazgos verificables, no razonamiento privado.',
      'Devuelve únicamente la estructura solicitada.',
    ].join(' ');
  }

  private sourceType(url: string): NoteSourceType {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (hostname === 'adecco.com' || hostname.endsWith('.adecco.com')) {
      return NoteSourceType.ADECCO_KNOWLEDGE;
    }
    const primaryDomains = [
      'gob.pe',
      'gov',
      'ilo.org',
      'oecd.org',
      'worldbank.org',
      'who.int',
      'un.org',
    ];
    return primaryDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
      ? NoteSourceType.PRIMARY
      : NoteSourceType.CONTEXT;
  }

  private sourceEntity(url: string) {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, 200);
  }

  private canonicalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sanitizeError(value: string) {
    return value.replace(/sk-[A-Za-z0-9_-]{10,}/g, '[credential-redacted]');
  }
}
