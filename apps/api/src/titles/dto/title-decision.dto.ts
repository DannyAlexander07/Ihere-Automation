import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DuplicateResolution,
  TitleDecisionType,
} from '../../generated/prisma/client';

export class TitleDecisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsEnum(TitleDecisionType)
  type!: TitleDecisionType;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsEnum(DuplicateResolution)
  duplicateResolution?: DuplicateResolution;
}
