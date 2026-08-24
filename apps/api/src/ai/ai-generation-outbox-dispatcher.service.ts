import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  AiGenerationStatus,
  OutboxJobStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AI_GENERATION_JOB,
  AiGenerationQueueService,
  type AiGenerationJobData,
} from './ai-generation-queue.service';

@Injectable()
export class AiGenerationOutboxDispatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    AiGenerationOutboxDispatcherService.name,
  );
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AiGenerationQueueService,
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
          jobType: AI_GENERATION_JOB,
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
        `No se pudieron despachar automatizaciones editoriales: ${this.message(error)}`,
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
      await this.queue.enqueue(this.parse(job.payload));
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
            Date.now() + Math.min(60_000, 1_500 * 2 ** (attempts - 1)),
          ),
          lastError: this.message(error).slice(0, 2_000),
        },
      });
    }
  }

  private async recover() {
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: AI_GENERATION_JOB,
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
    const cutoff = new Date(Date.now() - 10 * 60_000);
    await this.prisma.aiGenerationRun.updateMany({
      where: {
        status: AiGenerationStatus.RUNNING,
        updatedAt: { lt: cutoff },
      },
      data: {
        status: AiGenerationStatus.QUEUED,
        errorCode: null,
        errorMessage: null,
      },
    });
    const pending = await this.prisma.aiGenerationRun.findMany({
      where: { status: AiGenerationStatus.QUEUED },
      select: { id: true, tenantId: true },
      take: 500,
    });
    if (!pending.length) return;
    await this.prisma.outboxJob.createMany({
      data: pending.map((run) => ({
        tenantId: run.tenantId,
        jobType: AI_GENERATION_JOB,
        aggregateType: 'ai_generation_run',
        aggregateId: run.id,
        payload: { runId: run.id, dispatchId: randomUUID() },
      })),
      skipDuplicates: true,
    });
    await this.prisma.$transaction(
      pending.map((run) =>
        this.prisma.outboxJob.updateMany({
          where: {
            jobType: AI_GENERATION_JOB,
            aggregateType: 'ai_generation_run',
            aggregateId: run.id,
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
            payload: { runId: run.id, dispatchId: randomUUID() },
          },
        }),
      ),
    );
  }

  private parse(value: unknown): AiGenerationJobData {
    if (
      !value ||
      typeof value !== 'object' ||
      !('runId' in value) ||
      typeof value.runId !== 'string' ||
      !('dispatchId' in value) ||
      typeof value.dispatchId !== 'string'
    ) {
      throw new Error('Payload de automatización editorial inválido.');
    }
    return { runId: value.runId, dispatchId: value.dispatchId };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
