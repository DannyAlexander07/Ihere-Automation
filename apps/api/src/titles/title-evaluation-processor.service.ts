import { Injectable, Logger } from '@nestjs/common';
import {
  AgentType,
  AuditActorType,
  DuplicateResolution,
  EvaluationStatus,
  EvaluationVerdict,
  LearningRuleStatus,
  Prisma,
  TitleStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TitleRuleEvaluatorService } from './title-rule-evaluator.service';
import { TitleSimilarityService } from './title-similarity.service';
import type { EvaluationTitle } from './title-evaluation.types';
import {
  evaluateEditorialGlossary,
  parseEditorialGlossaries,
} from '../learning/editorial-glossary';

@Injectable()
export class TitleEvaluationProcessorService {
  private readonly logger = new Logger(TitleEvaluationProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly similarity: TitleSimilarityService,
    private readonly evaluator: TitleRuleEvaluatorService,
  ) {}

  async process(evaluationId: string, deadline: number) {
    const evaluation = await this.prisma.titleEvaluation.findUnique({
      where: { id: evaluationId },
      include: { proposal: true },
    });
    if (!evaluation) throw new Error('La evaluación solicitada no existe.');
    if (evaluation.status === EvaluationStatus.COMPLETED) {
      return { evaluationId, status: 'already-completed' };
    }
    if (evaluation.status === EvaluationStatus.CANCELLED) {
      return { evaluationId, status: 'cancelled' };
    }
    if (evaluation.proposal.currentVersion !== evaluation.version) {
      await this.cancelObsolete(evaluationId, evaluation.proposal);
      return { evaluationId, status: 'cancelled-obsolete-version' };
    }
    const processingStartedAt = Date.now();

    const claimed = await this.prisma.titleEvaluation.updateMany({
      where: { id: evaluationId, status: EvaluationStatus.QUEUED },
      data: {
        status: EvaluationStatus.RUNNING,
        verdict: null,
        overallScore: null,
        summary: null,
        startedAt: new Date(),
        completedAt: null,
      },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.titleEvaluation.findUnique({
        where: { id: evaluationId },
        select: { status: true },
      });
      return {
        evaluationId,
        status:
          current?.status === EvaluationStatus.COMPLETED
            ? 'already-completed'
            : 'already-running',
      };
    }

    await this.prisma.$transaction([
      this.prisma.agentResult.deleteMany({ where: { evaluationId } }),
      this.prisma.auditLog.create({
        data: {
          tenantId: evaluation.proposal.tenantId,
          clientId: evaluation.proposal.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'title.evaluation.started',
          entityType: 'title_evaluation',
          entityId: evaluationId,
          metadata: {
            proposalId: evaluation.proposalId,
            version: evaluation.version,
          },
        },
      }),
    ]);

    this.assertWithinDeadline(deadline);
    const comparisonWhere: Prisma.TitleProposalWhereInput = {
      tenantId: evaluation.proposal.tenantId,
      clientId: evaluation.proposal.clientId,
      id: { not: evaluation.proposalId },
      status: { notIn: [TitleStatus.REJECTED, TitleStatus.ARCHIVED] },
    };
    const comparisonSelect = {
      id: true,
      title: true,
      canonicalTitle: true,
      searchIntent: true,
      focus: true,
      status: true,
      createdAt: true,
    } as const;
    const [exactTitles, recentTitles, glossaryRules] = await Promise.all([
      this.prisma.titleProposal.findMany({
        where: {
          ...comparisonWhere,
          canonicalTitle: evaluation.proposal.canonicalTitle,
        },
        select: comparisonSelect,
        take: 20,
      }),
      this.prisma.titleProposal.findMany({
        where: comparisonWhere,
        select: comparisonSelect,
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      this.prisma.learningRule.findMany({
        where: {
          tenantId: evaluation.proposal.tenantId,
          status: LearningRuleStatus.ACTIVE,
          OR: [{ clientId: evaluation.proposal.clientId }, { clientId: null }],
          glossary: { not: Prisma.JsonNull },
        },
        select: { glossary: true },
      }),
    ]);
    const comparableTitles = [
      ...new Map(
        [...exactTitles, ...recentTitles].map((title) => [title.id, title]),
      ).values(),
    ];
    const proposal = evaluation.proposal as EvaluationTitle;
    const duplicate = this.similarity.evaluate(proposal, comparableTitles);
    const glossaryFindings = evaluateEditorialGlossary(
      `${proposal.service} ${proposal.title} ${proposal.objective} ${proposal.audience} ${proposal.focus} ${proposal.opportunity ?? ''} ${proposal.risk ?? ''}`,
      parseEditorialGlossaries(glossaryRules.map((rule) => rule.glossary)),
    );
    this.assertWithinDeadline(deadline);
    const result = this.evaluator.evaluate(
      proposal,
      duplicate,
      glossaryFindings,
    );
    const durationMs = Math.max(0, Date.now() - processingStartedAt);
    const duplicateResolution =
      duplicate.score >= 75
        ? DuplicateResolution.PENDING
        : DuplicateResolution.UNIQUE;
    const completedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.agentResult.createMany({
        data: result.agentResults.map((agent) => ({
          evaluationId,
          agentType: agent.agentType,
          verdict: agent.verdict,
          score: agent.score,
          summary: agent.summary,
          findings: agent.findings,
          evidence: agent.evidence as Prisma.InputJsonObject,
          provider: agent.provider,
          model: agent.model,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: 0n,
          durationMs,
        })),
      });
      const completed = await tx.titleEvaluation.updateMany({
        where: { id: evaluationId, status: EvaluationStatus.RUNNING },
        data: {
          status: EvaluationStatus.COMPLETED,
          verdict: result.verdict,
          overallScore: result.overallScore,
          summary: result.summary,
          completedAt,
        },
      });
      if (completed.count !== 1) {
        throw new Error('La evaluación perdió su reclamación activa.');
      }
      await tx.titleProposal.updateMany({
        where: {
          id: evaluation.proposalId,
          currentVersion: evaluation.version,
        },
        data: {
          duplicateScore: duplicate.score,
          duplicateResolution,
          duplicateOfId: duplicate.related?.id ?? null,
        },
      });
      await tx.titleProposal.updateMany({
        where: {
          id: evaluation.proposalId,
          currentVersion: evaluation.version,
          status: TitleStatus.EVALUATING,
        },
        data: { status: TitleStatus.PROPOSED },
      });
      await tx.auditLog.create({
        data: {
          tenantId: evaluation.proposal.tenantId,
          clientId: evaluation.proposal.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'title.evaluation.completed',
          entityType: 'title_evaluation',
          entityId: evaluationId,
          after: {
            status: EvaluationStatus.COMPLETED,
            verdict: result.verdict,
            overallScore: result.overallScore,
            duplicateScore: duplicate.score,
          },
          metadata: {
            proposalId: evaluation.proposalId,
            version: evaluation.version,
            provider: 'ihere-rules',
            agentCount: result.agentResults.length,
            durationMs,
            costMicros: 0,
          },
        },
      });
    });

    this.logger.log(
      `Evaluación ${evaluationId} completada con ${result.overallScore}/100 (${result.verdict}).`,
    );
    return {
      evaluationId,
      status: EvaluationStatus.COMPLETED,
      verdict: result.verdict,
      overallScore: result.overallScore,
    };
  }

  async recordFailure(
    evaluationId: string,
    error: Error,
    finalAttempt: boolean,
    attempt: number,
  ): Promise<void> {
    const evaluation = await this.prisma.titleEvaluation.findUnique({
      where: { id: evaluationId },
      include: { proposal: true },
    });
    if (!evaluation || evaluation.status === EvaluationStatus.COMPLETED) return;
    const message = error.message.slice(0, 2_000);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.titleEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: finalAttempt
            ? EvaluationStatus.FAILED
            : EvaluationStatus.QUEUED,
          verdict: finalAttempt ? EvaluationVerdict.ERROR : null,
          summary: finalAttempt
            ? `La evaluación falló después de ${attempt} intento(s): ${message}`
            : `El intento ${attempt} falló y será reintentado.`,
          startedAt: finalAttempt ? evaluation.startedAt : null,
          completedAt: finalAttempt ? now : null,
        },
      });
      if (finalAttempt) {
        await tx.agentResult.deleteMany({
          where: { evaluationId, agentType: AgentType.JUDGE },
        });
        await tx.agentResult.create({
          data: {
            evaluationId,
            agentType: AgentType.JUDGE,
            verdict: EvaluationVerdict.ERROR,
            score: 0,
            summary: 'La evaluación no pudo completarse.',
            findings: [message],
            evidence: { attempt, errorName: error.name },
            provider: 'ihere-worker',
            model: 'evaluation-worker-v1',
            errorCode: error.name.slice(0, 100),
          },
        });
        await tx.titleProposal.updateMany({
          where: {
            id: evaluation.proposalId,
            status: TitleStatus.EVALUATING,
            currentVersion: evaluation.version,
          },
          data: { status: TitleStatus.PROPOSED },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: evaluation.proposal.tenantId,
          clientId: evaluation.proposal.clientId,
          actorType: AuditActorType.SYSTEM,
          action: finalAttempt
            ? 'title.evaluation.failed'
            : 'title.evaluation.retry_scheduled',
          entityType: 'title_evaluation',
          entityId: evaluationId,
          metadata: {
            proposalId: evaluation.proposalId,
            version: evaluation.version,
            attempt,
            error: message,
          },
        },
      });
    });
  }

  private async cancelObsolete(
    evaluationId: string,
    proposal: EvaluationTitle,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.titleEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.CANCELLED,
          verdict: null,
          summary: 'La evaluación pertenece a una versión anterior del título.',
          completedAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: proposal.tenantId,
          clientId: proposal.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'title.evaluation.cancelled_obsolete',
          entityType: 'title_evaluation',
          entityId: evaluationId,
          metadata: { proposalId: proposal.id },
        },
      }),
    ]);
  }

  private assertWithinDeadline(deadline: number): void {
    if (Date.now() > deadline) {
      throw new Error('La evaluación excedió el tiempo máximo permitido.');
    }
  }
}
