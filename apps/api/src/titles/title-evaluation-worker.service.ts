import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { WorkerSupervisor } from '../common/queues/worker-supervisor';
import { TitleEvaluationProcessorService } from './title-evaluation-processor.service';
import {
  BULLMQ_PREFIX,
  redisConnection,
  TITLE_EVALUATION_QUEUE,
  type TitleEvaluationJobData,
} from './title-evaluation-queue.service';

@Injectable()
export class TitleEvaluationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TitleEvaluationWorkerService.name);
  private worker?: Worker<TitleEvaluationJobData>;
  private supervisor?: WorkerSupervisor;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: TitleEvaluationProcessorService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('TITLE_EVALUATION_WORKER_ENABLED')) return;
    const timeoutMs = this.config.getOrThrow<number>(
      'TITLE_EVALUATION_TIMEOUT_MS',
    );
    this.worker = new Worker<TitleEvaluationJobData>(
      TITLE_EVALUATION_QUEUE,
      async (job) => {
        const errorFrom = (value: unknown) =>
          value instanceof Error ? value : new Error(String(value));
        try {
          return await this.processor.process(
            job.data.evaluationId,
            Date.now() + timeoutMs,
          );
        } catch (value) {
          const error = errorFrom(value);
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
        concurrency: this.config.getOrThrow<number>(
          'TITLE_EVALUATION_CONCURRENCY',
        ),
        lockDuration: timeoutMs + 15_000,
        maxStalledCount: 1,
        autorun: false,
      },
    );
    this.worker.on('completed', (job) => {
      this.logger.log(`Trabajo ${job.id ?? 'sin-id'} completado.`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Trabajo ${job?.id ?? 'sin-id'} falló: ${error.message}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Error del worker: ${error.message}`);
    });
    this.supervisor = new WorkerSupervisor(
      this.worker,
      this.logger,
      'El trabajador de evaluación de títulos',
    );
    this.supervisor.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.supervisor?.close();
  }
}
