import { IsDateString, IsOptional } from 'class-validator';

export class SyncAnalyticsDto {
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;
}
