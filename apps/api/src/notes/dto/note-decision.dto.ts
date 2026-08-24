import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NoteDecisionType } from '../../generated/prisma/client';

export class NoteDecisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  expectedVersion!: number;

  @ApiProperty({ enum: NoteDecisionType })
  @IsEnum(NoteDecisionType)
  type!: NoteDecisionType;

  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
