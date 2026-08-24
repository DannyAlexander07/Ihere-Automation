import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
    example: '12345678',
    description: 'Alias de acceso; nunca se persiste en texto plano.',
  })
  @Matches(/^\d{8}$/)
  dni!: string;

  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  @Length(5, 128)
  password!: string;
}
