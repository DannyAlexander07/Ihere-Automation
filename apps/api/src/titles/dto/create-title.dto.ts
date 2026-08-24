import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTitleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ maxLength: 220 })
  @IsString()
  @MinLength(10)
  @MaxLength(220)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(600)
  objective!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  audience!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  searchIntent!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  focus!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  opportunity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  risk?: string;
}
