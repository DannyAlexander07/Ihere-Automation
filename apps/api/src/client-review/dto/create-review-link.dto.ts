import {
  IsEmail,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReviewLinkDto {
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
}
