import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NoteImageStatus } from '../../generated/prisma/client';

export class NoteImageDecisionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn([
    NoteImageStatus.APPROVED,
    NoteImageStatus.CHANGES_REQUESTED,
    NoteImageStatus.REJECTED,
  ])
  status!:
    | typeof NoteImageStatus.APPROVED
    | typeof NoteImageStatus.CHANGES_REQUESTED
    | typeof NoteImageStatus.REJECTED;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
