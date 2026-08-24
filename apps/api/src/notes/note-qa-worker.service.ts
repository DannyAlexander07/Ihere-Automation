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
import { NOTE_QA_QUEUE, type NoteQaJobData } from './note-qa-queue.service';
import { NoteQaProcessorService } from './note-qa-processor.service';

@Injectable()
export class NoteQaWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoteQaWorkerService.name);
  private worker?: Worker<NoteQaJobData>;
  private supervisor?: WorkerSupervisor;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: NoteQaProcessorService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('NOTE_QA_WORKER_ENABLED')) return;
    const timeoutMs = this.config.getOrThrow<number>('NOTE_QA_TIMEOUT_MS');
    this.worker = new Worker<NoteQaJobData>(
      NOTE_QA_QUEUE,
      async (job) => {
        try {
          return await this.processor.process(
            job.data.evaluationId,
            Date.now() + timeoutMs,
          );
        } catch (value) {
          const error =
            value instanceof Error ? value : new Error(String(value));
          const attempt = job.attemptsMade + 1;
          const finalAttempt = attempt >= (job.opts.attempts ?? 1);
          await this.processor.recordFailure(
            job.data.evaluationId,
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
        concurrency: this.config.getOrThrow<number>('NOTE_QA_CONCURRENCY'),
        lockDuration: timeoutMs + 15_000,
        maxStalledCount: 1,
        autorun: false,
      },
    );
    this.worker.on('completed', (job) =>
      this.logger.log(`QA de nota ${job.id ?? 'sin-id'} completado.`),
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        `QA de nota ${job?.id ?? 'sin-id'} falló: ${error.message}`,
      ),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Error del worker de QA: ${error.message}`),
    );
    this.supervisor = new WorkerSupervisor(
      this.worker,
      this.logger,
      'El trabajador de control de calidad',
    );
    this.supervisor.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.supervisor?.close();
  }
}
