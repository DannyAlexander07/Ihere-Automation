import { PrismaService } from '../database/prisma.service';
import { GoogleAnalyticsProviderService } from './google-analytics-provider.service';
import { AnalyticsSchedulerService } from './analytics-scheduler.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsSchedulerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancela tanto la ejecución inicial como el intervalo al cerrar el módulo', () => {
    const findMany = jest.fn();
    const service = new AnalyticsSchedulerService(
      {
        analyticsConnection: { findMany },
      } as unknown as PrismaService,
      {} as AnalyticsService,
      { enabled: true } as GoogleAnalyticsProviderService,
    );

    service.onModuleInit();
    expect(jest.getTimerCount()).toBe(2);

    service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(16 * 60_000);
    expect(findMany).not.toHaveBeenCalled();
  });
});
