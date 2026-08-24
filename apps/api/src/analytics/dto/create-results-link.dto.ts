import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateResultsLinkDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  recipientName!: string;

  @IsEmail()
  @MaxLength(254)
  recipientEmail!: string;

  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays!: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  reportStartDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  reportEndDate?: string;
}
