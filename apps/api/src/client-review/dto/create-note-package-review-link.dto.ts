import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNotePackageReviewLinkDto {
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  recipientName!: string;

  @IsEmail()
  @MaxLength(254)
  recipientEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUUID(undefined, { each: true })
  @Type(() => String)
  noteIds!: string[];
}
