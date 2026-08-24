import type { Logger } from '@nestjs/common';

type SupervisedWorker = {
  close(force?: boolean): Promise<void>;
  isPaused(): boolean;
  isRunning(): boolean;
  run(): Promise<void>;
};

/**
 * Keeps a BullMQ worker consuming after a transient Redis interruption.
 * BullMQ reports a stopped run loop through its promise; it does not
 * automatically create a new loop in every failure scenario.
 */
export class WorkerSupervisor {
  private timer?: NodeJS.Timeout;
  private stopping = false;

  constructor(
    private readonly worker: SupervisedWorker,
    private readonly logger: Pick<Logger, 'error' | 'warn'>,
    private readonly label: string,
    private readonly checkIntervalMs = 5_000,
  ) {}

  start(): void {
    if (this.timer || this.stopping) return;
    this.ensureRunning();
    this.timer = setInterval(() => this.ensureRunning(), this.checkIntervalMs);
    this.timer.unref();
  }

  async close(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.worker.close();
  }

  private ensureRunning(): void {
    if (this.stopping || this.worker.isPaused() || this.worker.isRunning()) {
      return;
    }
    void this.worker.run().then(
      () => {
        if (!this.stopping && !this.worker.isPaused()) {
          this.logger.warn(
            `${this.label} se detuvo; se intentará reactivar automáticamente.`,
          );
        }
      },
      (error: unknown) => {
        if (!this.stopping) {
          this.logger.error(
            `${this.label} se interrumpió: ${this.message(error)}. Se intentará reactivar automáticamente.`,
          );
        }
      },
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
