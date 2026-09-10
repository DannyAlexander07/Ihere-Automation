import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsSchedulerService } from './analytics-scheduler.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsTokenVaultService } from './analytics-token-vault.service';
import { GoogleAnalyticsProviderService } from './google-analytics-provider.service';
import { PublicationUrlValidatorService } from './publication-url-validator.service';
import { AnalyticsRecommendationsService } from './analytics-recommendations.service';
import { AnalyticsReportRendererService } from './analytics-report-renderer.service';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsSchedulerService,
    AnalyticsTokenVaultService,
    GoogleAnalyticsProviderService,
    PublicationUrlValidatorService,
    AnalyticsRecommendationsService,
    AnalyticsReportRendererService,
  ],
})
export class AnalyticsModule {}
