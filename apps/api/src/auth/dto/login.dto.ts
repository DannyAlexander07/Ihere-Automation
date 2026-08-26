import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'mood',
    description: 'Organización; luego podrá resolverse por subdominio.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(40)
  tenantCode?: string;

  @ApiProperty({
    example: 'persona@empresa.com',
    description: 'Correo corporativo de la cuenta.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /** Compatibilidad exclusiva de fixtures automatizados; no se acepta en producción. */
  @ApiHideProperty()
  @IsOptional()
  @Matches(/^\d{8}$/)
  dni?: string;

  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  @Length(5, 128)
  password!: string;
}
