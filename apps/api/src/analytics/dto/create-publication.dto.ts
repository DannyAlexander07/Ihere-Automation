import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreatePublicationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  noteId!: string;

  @ApiProperty({ maxLength: 2048 })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @ApiProperty({ example: '2026-08-19' })
  @IsDateString({ strict: true })
  publishedAt!: string;
}
