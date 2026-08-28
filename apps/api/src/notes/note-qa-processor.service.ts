import { Injectable, Logger } from '@nestjs/common';
import {
  AuditActorType,
  EvaluationStatus,
  EvaluationVerdict,
  LearningRuleStatus,
  NoteStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NoteQaRulesService } from './note-qa-rules.service';
import { NoteSimilarityService } from './note-similarity.service';
import { parseEditorialGlossaries } from '../learning/editorial-glossary';

const NOTE_QA_RULE_VERSION = 'note-editorial-rubric-v3';

@Injectable()
export class NoteQaProcessorService {
  private readonly logger = new Logger(NoteQaProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: NoteQaRulesService,
    private readonly similarity: NoteSimilarityService,
  ) {}

  async process(evaluationId: string, deadline: number) {
    const evaluation = await this.prisma.noteQaEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        note: { include: { client: { select: { slug: true } } } },
      },
    });
    if (!evaluation) throw new Error('La evaluación de nota no existe.');
    if (evaluation.status === EvaluationStatus.COMPLETED) {
      return { evaluationId, status: 'already-completed' };
    }
    if (evaluation.status === EvaluationStatus.CANCELLED) {
      return { evaluationId, status: 'cancelled' };
    }
    if (evaluation.note.currentVersion !== evaluation.version) {
      await this.cancelObsolete(evaluationId, evaluation.note);
      return { evaluationId, status: 'cancelled-obsolete-version' };
    }

    const version = await this.prisma.noteVersion.findUnique({
      where: {
        noteId_version: {
          noteId: evaluation.noteId,
          version: evaluation.version,
        },
      },
      include: { sources: true },
    });
    if (!version) throw new Error('La versión de nota para QA no existe.');
    const claimed = await this.prisma.noteQaEvaluation.updateMany({
      where: { id: evaluationId, status: EvaluationStatus.QUEUED },
      data: {
        status: EvaluationStatus.RUNNING,
        verdict: null,
        overallScore: null,
        summary: null,
        criticalBlockers: Prisma.JsonNull,
        startedAt: new Date(),
        completedAt: null,
      },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.noteQaEvaluation.findUnique({
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
    const startedAt = Date.now();
    await this.prisma.$transaction([
      this.prisma.noteQaResult.deleteMany({ where: { evaluationId } }),
      this.prisma.noteDocument.updateMany({
        where: {
          id: evaluation.noteId,
          currentVersion: evaluation.version,
          status: NoteStatus.QA_QUEUED,
        },
        data: { status: NoteStatus.QA_RUNNING },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: evaluation.note.tenantId,
          clientId: evaluation.note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.qa.started',
          entityType: 'note_qa_evaluation',
          entityId: evaluationId,
          metadata: { noteId: evaluation.noteId, version: evaluation.version },
        },
      }),
    ]);

    this.assertWithinDeadline(deadline);
    const [comparisonNotes, glossaryRules] = await Promise.all([
      this.prisma.noteDocument.findMany({
        where: {
          tenantId: evaluation.note.tenantId,
          clientId: evaluation.note.clientId,
          id: { not: evaluation.noteId },
          currentVersion: { gt: 0 },
        },
        select: {
          id: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { title: true, content: true },
          },
        },
      }),
      this.prisma.learningRule.findMany({
        where: {
          tenantId: evaluation.note.tenantId,
          status: LearningRuleStatus.ACTIVE,
          OR: [{ clientId: evaluation.note.clientId }, { clientId: null }],
          glossary: { not: Prisma.JsonNull },
        },
        select: { glossary: true },
      }),
    ]);
    const similarity = this.similarity.compare(
      { title: version.title, content: version.content },
      comparisonNotes.flatMap((note) =>
        note.versions.map((item) => ({
          noteId: note.id,
          title: item.title,
          content: item.content,
        })),
      ),
    );
    const result = this.rules.evaluate(version, {
      clientSlug: evaluation.note.client.slug,
      similarity,
      glossary: parseEditorialGlossaries(
        glossaryRules.map((rule) => rule.glossary),
      ),
    });
    this.assertWithinDeadline(deadline);
    const durationMs = Math.max(0, Date.now() - startedAt);
    const nextStatus =
      result.verdict === EvaluationVerdict.PASS && result.overallScore >= 80
        ? NoteStatus.READY_FOR_REVIEW
        : NoteStatus.CHANGES_REQUESTED;

    await this.prisma.$transaction(async (tx) => {
      await tx.noteQaResult.createMany({
        data: result.dimensions.map((dimension) => ({
          evaluationId,
          dimension: dimension.dimension,
          score: dimension.score,
          maxScore: dimension.maxScore,
          verdict: dimension.verdict,
          summary: dimension.summary,
          findings: dimension.findings,
          evidence: dimension.evidence as Prisma.InputJsonObject,
          ruleVersion: NOTE_QA_RULE_VERSION,
          durationMs,
        })),
      });
      await tx.noteQaEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.COMPLETED,
          verdict: result.verdict,
          overallScore: result.overallScore,
          summary: result.summary,
          criticalBlockers: result.criticalBlockers,
          completedAt: new Date(),
        },
      });
      await tx.noteDocument.updateMany({
        where: {
          id: evaluation.noteId,
          currentVersion: evaluation.version,
          status: { in: [NoteStatus.QA_QUEUED, NoteStatus.QA_RUNNING] },
        },
        data: { status: nextStatus },
      });
      await tx.auditLog.create({
        data: {
          tenantId: evaluation.note.tenantId,
          clientId: evaluation.note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.qa.completed',
          entityType: 'note_qa_evaluation',
          entityId: evaluationId,
          after: {
            status: EvaluationStatus.COMPLETED,
            verdict: result.verdict,
            overallScore: result.overallScore,
            criticalBlockers: result.criticalBlockers,
          },
          metadata: {
            noteId: evaluation.noteId,
            version: evaluation.version,
            ruleVersion: NOTE_QA_RULE_VERSION,
            durationMs,
            costMicros: 0,
          },
        },
      });
    });

    this.logger.log(
      `QA ${evaluationId} completado con ${result.overallScore}/100 (${result.verdict}).`,
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
  ) {
    const evaluation = await this.prisma.noteQaEvaluation.findUnique({
      where: { id: evaluationId },
      include: { note: true },
    });
    if (!evaluation || evaluation.status === EvaluationStatus.COMPLETED) return;
    const message = error.message.slice(0, 2_000);
    await this.prisma.$transaction([
      this.prisma.noteQaEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: finalAttempt
            ? EvaluationStatus.FAILED
            : EvaluationStatus.QUEUED,
          verdict: finalAttempt ? EvaluationVerdict.ERROR : null,
          overallScore: finalAttempt ? 0 : null,
          summary: finalAttempt
            ? `El QA falló después de ${attempt} intento(s): ${message}`
            : `El intento ${attempt} falló y será reintentado.`,
          completedAt: finalAttempt ? new Date() : null,
        },
      }),
      this.prisma.noteDocument.updateMany({
        where: {
          id: evaluation.noteId,
          currentVersion: evaluation.version,
          status: { in: [NoteStatus.QA_QUEUED, NoteStatus.QA_RUNNING] },
        },
        data: {
          status: finalAttempt
            ? NoteStatus.CHANGES_REQUESTED
            : NoteStatus.QA_QUEUED,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: evaluation.note.tenantId,
          clientId: evaluation.note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: finalAttempt ? 'note.qa.failed' : 'note.qa.retry_scheduled',
          entityType: 'note_qa_evaluation',
          entityId: evaluationId,
          metadata: {
            noteId: evaluation.noteId,
            version: evaluation.version,
            attempt,
            error: message,
          },
        },
      }),
    ]);
  }

  private async cancelObsolete(
    evaluationId: string,
    note: { id: string; tenantId: string; clientId: string },
  ) {
    await this.prisma.$transaction([
      this.prisma.noteQaEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.CANCELLED,
          verdict: null,
          summary: 'El QA pertenece a una versión anterior de la nota.',
          completedAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: note.tenantId,
          clientId: note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.qa.cancelled_obsolete',
          entityType: 'note_qa_evaluation',
          entityId: evaluationId,
          metadata: { noteId: note.id },
        },
      }),
    ]);
  }

  private assertWithinDeadline(deadline: number) {
    if (Date.now() > deadline)
      throw new Error('El QA excedió el tiempo máximo permitido.');
  }
}
