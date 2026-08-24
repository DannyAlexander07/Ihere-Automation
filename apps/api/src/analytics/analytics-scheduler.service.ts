import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AnalyticsConnectionStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GoogleAnalyticsProviderService } from './google-analytics-provider.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AnalyticsSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;
  private running = false;
  private destroyed = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly google: GoogleAnalyticsProviderService,
  ) {}

  onModuleInit(): void {
    if (!this.google.enabled) return;
    this.timer = setInterval(() => void this.tick(), 15 * 60_000);
    this.timer.unref();
    this.initialTimer = setTimeout(() => void this.tick(), 30_000);
    this.initialTimer.unref();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.timer = undefined;
    this.initialTimer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.destroyed || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.analyticsConnection.findMany({
        where: {
          status: AnalyticsConnectionStatus.CONNECTED,
          nextSyncAt: { lte: now },
        },
        select: { id: true, nextSyncAt: true },
        orderBy: { nextSyncAt: 'asc' },
        take: 5,
      });
      for (const connection of due) {
        const reserved = await this.prisma.analyticsConnection.updateMany({
          where: { id: connection.id, nextSyncAt: connection.nextSyncAt },
          data: { nextSyncAt: new Date(Date.now() + 30 * 60_000) },
        });
        if (reserved.count !== 1) continue;
        try {
          await this.analytics.syncScheduled(connection.id);
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: 'analytics.sync.scheduled_failed',
              connectionId: connection.id,
              message:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : 'unknown',
            }),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
