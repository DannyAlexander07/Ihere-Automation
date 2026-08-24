import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTitlePackageReviewLinkDto {
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

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUUID(undefined, { each: true })
  @Type(() => String)
  proposalIds?: string[];
}
