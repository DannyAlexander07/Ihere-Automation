import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ExportStatus, OutboxJobStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  EXPORT_JOB,
  ExportQueueService,
  type ExportJobData,
} from './export-queue.service';

@Injectable()
export class ExportOutboxDispatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExportOutboxDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ExportQueueService,
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
          jobType: EXPORT_JOB,
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
        `No se pudieron despachar exportaciones: ${this.message(error)}`,
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
            Date.now() + Math.min(60_000, 1_000 * 2 ** (attempts - 1)),
          ),
          lastError: this.message(error).slice(0, 2_000),
        },
      });
    }
  }

  private async recover() {
    await this.prisma.outboxJob.updateMany({
      where: {
        jobType: EXPORT_JOB,
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
    const pending = await this.prisma.exportArtifact.findMany({
      where: { status: { in: [ExportStatus.QUEUED, ExportStatus.GENERATING] } },
      select: { id: true, note: { select: { tenantId: true } } },
      take: 500,
    });
    if (!pending.length) return;
    await this.prisma.outboxJob.createMany({
      data: pending.map((artifact) => ({
        tenantId: artifact.note.tenantId,
        jobType: EXPORT_JOB,
        aggregateType: 'export_artifact',
        aggregateId: artifact.id,
        payload: { artifactId: artifact.id, dispatchId: randomUUID() },
      })),
      skipDuplicates: true,
    });
    await this.prisma.exportArtifact.updateMany({
      where: {
        id: { in: pending.map((artifact) => artifact.id) },
        status: ExportStatus.GENERATING,
      },
      data: { status: ExportStatus.QUEUED },
    });
    await this.prisma.$transaction(
      pending.map((artifact) =>
        this.prisma.outboxJob.updateMany({
          where: {
            jobType: EXPORT_JOB,
            aggregateType: 'export_artifact',
            aggregateId: artifact.id,
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
            payload: {
              artifactId: artifact.id,
              dispatchId: randomUUID(),
            },
          },
        }),
      ),
    );
  }

  private parse(value: unknown): ExportJobData {
    if (
      !value ||
      typeof value !== 'object' ||
      !('artifactId' in value) ||
      typeof value.artifactId !== 'string' ||
      !('dispatchId' in value) ||
      typeof value.dispatchId !== 'string'
    ) {
      throw new Error('Payload de exportación inválido.');
    }
    return { artifactId: value.artifactId, dispatchId: value.dispatchId };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
