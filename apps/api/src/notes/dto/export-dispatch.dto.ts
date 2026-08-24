import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ExportDispatchDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  recipientEmail!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  senderEmail!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  subject!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  externalMessageId?: string;

  @IsBoolean()
  @Equals(true)
  confirmedSent!: true;
}
