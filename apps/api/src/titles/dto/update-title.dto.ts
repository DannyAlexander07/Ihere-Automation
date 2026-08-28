import { ApiProperty } from '@nestjs/swagger';
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
import { CorrectionType } from '../../generated/prisma/client';

export class UpdateTitleDto {
  @ApiProperty({
    description:
      'Versión leída por el usuario; evita sobrescribir cambios ajenos.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(800)
  reason!: string;

  @IsEnum(CorrectionType)
  correctionType!: CorrectionType;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) service?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(220) title?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(600) objective?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) audience?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) searchIntent?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) focus?: string;
  @IsOptional() @IsString() @MaxLength(600) opportunity?: string;
  @IsOptional() @IsString() @MaxLength(600) risk?: string;
}
