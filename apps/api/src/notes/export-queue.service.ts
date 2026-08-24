import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  BULLMQ_PREFIX,
  redisConnection,
} from '../titles/title-evaluation-queue.service';

export const EXPORT_QUEUE = 'ihere-note-exports';
export const EXPORT_JOB = 'generate-note-export';
export type ExportJobData = { artifactId: string; dispatchId: string };

@Injectable()
export class ExportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportQueueService.name);
  private queue?: Queue<ExportJobData>;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('EXPORT_WORKER_ENABLED') ?? false;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Cola de exportaciones deshabilitada por configuración.');
      return;
    }
    this.queue = new Queue<ExportJobData>(EXPORT_QUEUE, {
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
    this.queue.on('error', (error) =>
      this.logger.error(
        `Error de conexión con exportaciones: ${error.message}`,
      ),
    );
  }

  async enqueue(data: ExportJobData): Promise<void> {
    if (!this.queue)
      throw new Error('La cola de exportaciones no está activa.');
    await this.queue.add(EXPORT_JOB, data, {
      jobId: data.dispatchId,
      deduplication: { id: data.dispatchId },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
