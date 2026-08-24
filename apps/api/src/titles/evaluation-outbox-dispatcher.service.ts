import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvaluationStatus, OutboxJobStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  TITLE_EVALUATION_JOB,
  TitleEvaluationQueueService,
  type TitleEvaluationJobData,
} from './title-evaluation-queue.service';

@Injectable()
export class EvaluationOutboxDispatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EvaluationOutboxDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TitleEvaluationQueueService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.queue.enabled) return;
    const interval = this.config.getOrThrow<number>('OUTBOX_POLL_INTERVAL_MS');
    void this.recoverStaleClaims()
      .then(() => this.backfillMissingEvaluations())
      .then(() => this.dispatch());
    this.timer = setInterval(() => void this.dispatch(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const jobs = await this.prisma.outboxJob.findMany({
        where: {
          jobType: TITLE_EVALUATION_JOB,
          status: {
            in: [OutboxJobStatus.PENDING, OutboxJobStatus.FAILED],
          },
          attempts: { lt: 10 },
          availableAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const job of jobs) await this.dispatchOne(job);
    } catch (error) {
      this.logger.error(
        `No se pudo despachar el outbox: ${this.messageFrom(error)}`,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchOne(job: {
    id: string;
    jobType: string;
    payload: unknown;
    status: OutboxJobStatus;
    attempts: number;
  }): Promise<void> {
    const claimed = await this.prisma.outboxJob.updateMany({
      where: { id: job.id, status: job.status },
      data: { status: OutboxJobStatus.DISPATCHING },
    });
    if (claimed.count !== 1) return;

    try {
      const payload = this.parsePayload(job.payload);
      await this.queue.enqueue(job.id, payload);
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
      const delayMs = Math.min(60_000, 1_000 * 2 ** (attempts - 1));
      await this.prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: OutboxJobStatus.FAILED,
          attempts,
          availableAt: new Date(Date.now() + delayMs),
          lastError: this.messageFrom(error).slice(0, 2_000),
        },
      });
    }
  }

  private async recoverStaleClaims(): Promise<void> {
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: TITLE_EVALUATION_JOB,
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

  private async backfillMissingEvaluations(): Promise<void> {
    const pending = await this.prisma.titleEvaluation.findMany({
      where: {
        status: { in: [EvaluationStatus.QUEUED, EvaluationStatus.RUNNING] },
      },
      select: {
        id: true,
        proposal: { select: { tenantId: true } },
      },
      take: 500,
    });
    if (!pending.length) return;
    await this.prisma.outboxJob.createMany({
      data: pending.map((evaluation) => ({
        tenantId: evaluation.proposal.tenantId,
        jobType: TITLE_EVALUATION_JOB,
        aggregateType: 'title_evaluation',
        aggregateId: evaluation.id,
        payload: { evaluationId: evaluation.id },
      })),
      skipDuplicates: true,
    });
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: TITLE_EVALUATION_JOB,
        aggregateType: 'title_evaluation',
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

  private parsePayload(value: unknown): TitleEvaluationJobData {
    if (
      !value ||
      typeof value !== 'object' ||
      !('evaluationId' in value) ||
      typeof value.evaluationId !== 'string'
    ) {
      throw new Error('Payload de evaluación inválido.');
    }
    return { evaluationId: value.evaluationId };
  }

  private messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
