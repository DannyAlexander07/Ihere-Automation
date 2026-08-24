import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class ConfirmPublicationDto {
  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ example: '2026-08-19' })
  @IsOptional()
  @IsDateString({ strict: true })
  publishedAt?: string;
}
