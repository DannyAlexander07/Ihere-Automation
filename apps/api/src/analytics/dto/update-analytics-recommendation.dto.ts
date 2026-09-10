import {
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AnalyticsRecommendationStatus } from '../../generated/prisma/client';

export class UpdateAnalyticsRecommendationDto {
  @IsUUID()
  clientId!: string;

  @IsEnum(AnalyticsRecommendationStatus)
  status!: AnalyticsRecommendationStatus;

  @IsString()
  @MinLength(5)
  @MaxLength(1400)
  note!: string;
}
