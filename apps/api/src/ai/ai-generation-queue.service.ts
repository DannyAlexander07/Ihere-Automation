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

export const AI_GENERATION_QUEUE = 'ihere-ai-generations';
export const AI_GENERATION_JOB = 'run-ai-generation';
export type AiGenerationJobData = { runId: string; dispatchId: string };

@Injectable()
export class AiGenerationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiGenerationQueueService.name);
  private queue?: Queue<AiGenerationJobData>;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<boolean>('AI_GENERATION_ENABLED') &&
      this.config.get<boolean>('AI_GENERATION_WORKER_ENABLED'),
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Cola de automatización editorial deshabilitada.');
      return;
    }
    this.queue = new Queue<AiGenerationJobData>(AI_GENERATION_QUEUE, {
      prefix: BULLMQ_PREFIX,
      connection: redisConnection(
        this.config.getOrThrow<string>('REDIS_URL'),
        false,
      ),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3_000, jitter: 0.25 },
        removeOnComplete: { age: 604_800, count: 2_000 },
        removeOnFail: { age: 2_592_000, count: 5_000 },
      },
    });
    this.queue.on('error', (error) =>
      this.logger.error(`Error de cola editorial: ${error.message}`),
    );
  }

  async enqueue(data: AiGenerationJobData): Promise<void> {
    if (!this.queue) throw new Error('La cola editorial no está activa.');
    await this.queue.add(AI_GENERATION_JOB, data, {
      jobId: data.dispatchId,
      deduplication: { id: data.dispatchId },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
