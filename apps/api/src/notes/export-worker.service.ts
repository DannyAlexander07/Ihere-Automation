import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { WorkerSupervisor } from '../common/queues/worker-supervisor';
import {
  BULLMQ_PREFIX,
  redisConnection,
} from '../titles/title-evaluation-queue.service';
import { EXPORT_QUEUE, type ExportJobData } from './export-queue.service';
import { ExportProcessorService } from './export-processor.service';

@Injectable()
export class ExportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorkerService.name);
  private worker?: Worker<ExportJobData>;
  private supervisor?: WorkerSupervisor;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: ExportProcessorService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('EXPORT_WORKER_ENABLED')) return;
    const timeoutMs = this.config.getOrThrow<number>('EXPORT_TIMEOUT_MS');
    this.worker = new Worker<ExportJobData>(
      EXPORT_QUEUE,
      async (job) => {
        try {
          return await this.processor.process(
            job.data.artifactId,
            Date.now() + timeoutMs,
          );
        } catch (value) {
          const error =
            value instanceof Error ? value : new Error(String(value));
          const attempt = job.attemptsMade + 1;
          const finalAttempt = attempt >= (job.opts.attempts ?? 1);
          await this.processor.recordFailure(
            job.data.artifactId,
            error,
            finalAttempt,
            attempt,
          );
          throw error;
        }
      },
      {
        prefix: BULLMQ_PREFIX,
        connection: redisConnection(
          this.config.getOrThrow<string>('REDIS_URL'),
          true,
        ),
        concurrency: this.config.getOrThrow<number>('EXPORT_CONCURRENCY'),
        lockDuration: timeoutMs + 15_000,
        maxStalledCount: 1,
        autorun: false,
      },
    );
    this.worker.on('completed', (job) =>
      this.logger.log(`Exportación ${job.id ?? 'sin-id'} completada.`),
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        `Exportación ${job?.id ?? 'sin-id'} falló: ${error.message}`,
      ),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Error del worker de exportaciones: ${error.message}`),
    );
    this.supervisor = new WorkerSupervisor(
      this.worker,
      this.logger,
      'El trabajador de exportaciones',
    );
    this.supervisor.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.supervisor?.close();
  }
}
