import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReviewDispatchDto {
  @IsEmail()
  @MaxLength(254)
  senderEmail!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  externalMessageId?: string;

  @IsBoolean()
  @Equals(true)
  confirmedSent!: true;
}
