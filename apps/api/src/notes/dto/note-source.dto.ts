import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoteSourceType } from '../../generated/prisma/client';

export class NoteSourceDto {
  @ApiProperty({ enum: NoteSourceType })
  @IsEnum(NoteSourceType)
  type!: NoteSourceType;

  @ApiProperty({ minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  entity!: string;

  @ApiProperty({ maxLength: 1200 })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(1200)
  url!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  accessedAt!: Date;
}
