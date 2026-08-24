import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  titleProposalId!: string;
}
