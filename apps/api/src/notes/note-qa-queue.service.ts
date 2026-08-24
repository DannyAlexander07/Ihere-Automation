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

export const NOTE_QA_QUEUE = 'ihere-note-qa';
export const NOTE_QA_JOB = 'evaluate-note';
export type NoteQaJobData = { evaluationId: string };

@Injectable()
export class NoteQaQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoteQaQueueService.name);
  private queue?: Queue<NoteQaJobData>;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('NOTE_QA_WORKER_ENABLED') ?? false;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Cola de QA de notas deshabilitada por configuración.');
      return;
    }
    this.queue = new Queue<NoteQaJobData>(NOTE_QA_QUEUE, {
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
      this.logger.error(`Error de conexión con QA de notas: ${error.message}`);
    });
  }

  async enqueue(outboxId: string, data: NoteQaJobData): Promise<void> {
    if (!this.queue) throw new Error('La cola de QA de notas no está activa.');
    await this.queue.add(NOTE_QA_JOB, data, {
      jobId: outboxId,
      deduplication: { id: outboxId },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
