import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EvaluationStatus,
  NoteStatus,
  OutboxJobStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  NOTE_QA_JOB,
  NoteQaQueueService,
  type NoteQaJobData,
} from './note-qa-queue.service';

@Injectable()
export class NoteQaOutboxDispatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NoteQaOutboxDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NoteQaQueueService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.queue.enabled) return;
    const interval = this.config.getOrThrow<number>('OUTBOX_POLL_INTERVAL_MS');
    void this.recover()
      .then(() => this.backfill())
      .then(() => this.dispatch());
    this.timer = setInterval(() => void this.dispatch(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const jobs = await this.prisma.outboxJob.findMany({
        where: {
          jobType: NOTE_QA_JOB,
          status: { in: [OutboxJobStatus.PENDING, OutboxJobStatus.FAILED] },
          attempts: { lt: 10 },
          availableAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const job of jobs) await this.dispatchOne(job);
    } catch (error) {
      this.logger.error(
        `No se pudo despachar QA de notas: ${this.message(error)}`,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchOne(job: {
    id: string;
    payload: unknown;
    status: OutboxJobStatus;
    attempts: number;
  }) {
    const claimed = await this.prisma.outboxJob.updateMany({
      where: { id: job.id, status: job.status },
      data: { status: OutboxJobStatus.DISPATCHING },
    });
    if (claimed.count !== 1) return;
    try {
      await this.queue.enqueue(job.id, this.parse(job.payload));
      await this.prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: OutboxJobStatus.DISPATCHED,
          dispatchedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      await this.prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: OutboxJobStatus.FAILED,
          attempts,
          availableAt: new Date(
            Date.now() + Math.min(60_000, 1_000 * 2 ** (attempts - 1)),
          ),
          lastError: this.message(error).slice(0, 2_000),
        },
      });
    }
  }

  private async recover() {
    const staleCutoff = new Date(
      Date.now() -
        this.config.getOrThrow<number>('NOTE_QA_TIMEOUT_MS') -
        15_000,
    );
    const stale = await this.prisma.noteQaEvaluation.findMany({
      where: {
        status: EvaluationStatus.RUNNING,
        startedAt: { lt: staleCutoff },
      },
      select: { id: true, noteId: true },
      take: 500,
    });
    if (stale.length) {
      await this.prisma.$transaction([
        this.prisma.noteQaEvaluation.updateMany({
          where: {
            id: { in: stale.map((item) => item.id) },
            status: EvaluationStatus.RUNNING,
          },
          data: {
            status: EvaluationStatus.QUEUED,
            startedAt: null,
            summary: 'QA recuperado después de una interrupción.',
          },
        }),
        this.prisma.noteDocument.updateMany({
          where: {
            id: { in: stale.map((item) => item.noteId) },
            status: NoteStatus.QA_RUNNING,
          },
          data: { status: NoteStatus.QA_QUEUED },
        }),
      ]);
    }
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: NOTE_QA_JOB,
        status: OutboxJobStatus.DISPATCHING,
        updatedAt: { lt: new Date(Date.now() - 60_000) },
      },
      data: {
        status: OutboxJobStatus.FAILED,
        availableAt: new Date(),
        lastError: 'Reclamación recuperada después de una interrupción.',
      },
    });
  }

  private async backfill() {
    const pending = await this.prisma.noteQaEvaluation.findMany({
      where: {
        status: { in: [EvaluationStatus.QUEUED, EvaluationStatus.RUNNING] },
      },
      select: { id: true, note: { select: { tenantId: true } } },
      take: 500,
    });
    if (!pending.length) return;
    await this.prisma.outboxJob.createMany({
      data: pending.map((evaluation) => ({
        tenantId: evaluation.note.tenantId,
        jobType: NOTE_QA_JOB,
        aggregateType: 'note_qa_evaluation',
        aggregateId: evaluation.id,
        payload: { evaluationId: evaluation.id },
      })),
      skipDuplicates: true,
    });
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: NOTE_QA_JOB,
        aggregateType: 'note_qa_evaluation',
        aggregateId: { in: pending.map((evaluation) => evaluation.id) },
        status: {
          in: [
            OutboxJobStatus.DISPATCHED,
            OutboxJobStatus.DISPATCHING,
            OutboxJobStatus.FAILED,
          ],
        },
        attempts: { lt: 10 },
      },
      data: {
        status: OutboxJobStatus.PENDING,
        availableAt: new Date(),
        lastError: null,
      },
    });
  }

  private parse(value: unknown): NoteQaJobData {
    if (
      !value ||
      typeof value !== 'object' ||
      !('evaluationId' in value) ||
      typeof value.evaluationId !== 'string'
    ) {
      throw new Error('Payload de QA de nota inválido.');
    }
    return { evaluationId: value.evaluationId };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
