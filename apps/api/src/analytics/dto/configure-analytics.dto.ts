import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ConfigureAnalyticsDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,40}$/)
  ga4PropertyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https:\/\/[^\s]+|sc-domain:[a-z0-9.-]+)$/i)
  gscSiteUrl?: string;
}
