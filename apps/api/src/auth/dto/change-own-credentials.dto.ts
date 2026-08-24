import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangeOwnCredentialsDto {
  @ApiProperty({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(5, 128)
  currentPassword!: string;

  @ApiPropertyOptional({ pattern: '^\\d{8}$' })
  @IsOptional()
  @Matches(/^\d{8}$/, {
    message: 'El DNI debe contener exactamente 8 dígitos.',
  })
  newDni?: string;

  @ApiPropertyOptional({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  newPassword?: string;
}
