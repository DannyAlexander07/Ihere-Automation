import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

export const TITLE_EVALUATION_QUEUE = 'ihere-title-evaluations';
export const TITLE_EVALUATION_JOB = 'evaluate-title';
export const BULLMQ_PREFIX = 'ihere';

export type TitleEvaluationJobData = {
  evaluationId: string;
};

export function redisConnection(
  redisUrl: string,
  worker: boolean,
): ConnectionOptions {
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error('REDIS_URL debe utilizar redis:// o rediss://.');
  }
  const database = Number(url.pathname.replace('/', '') || '0');
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('REDIS_URL contiene un número de base inválido.');
  }
  return {
    host: url.hostname,
    port: Number(url.port || '6379'),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database,
    maxRetriesPerRequest: worker ? null : 1,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

@Injectable()
export class TitleEvaluationQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TitleEvaluationQueueService.name);
  private queue?: Queue<TitleEvaluationJobData>;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('TITLE_EVALUATION_WORKER_ENABLED') ?? false;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Cola de evaluaciones deshabilitada por configuración.');
      return;
    }
    this.queue = new Queue<TitleEvaluationJobData>(TITLE_EVALUATION_QUEUE, {
      prefix: BULLMQ_PREFIX,
      connection: redisConnection(
        this.config.getOrThrow<string>('REDIS_URL'),
        false,
      ),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
    this.queue.on('error', (error) => {
      this.logger.error(`Error de conexión con la cola: ${error.message}`);
    });
  }

  async enqueue(outboxId: string, data: TitleEvaluationJobData): Promise<void> {
    if (!this.queue) throw new Error('La cola de evaluaciones no está activa.');
    await this.queue.add(TITLE_EVALUATION_JOB, data, {
      jobId: outboxId,
      deduplication: { id: outboxId },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
