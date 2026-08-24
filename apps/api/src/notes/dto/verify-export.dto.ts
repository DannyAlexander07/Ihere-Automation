import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class VerifyExportDto {
  @ApiProperty({
    description: 'Huella SHA-256 mostrada al descargar el archivo.',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedContentHash!: string;

  @ApiProperty()
  @IsBoolean()
  @Equals(true)
  visualCheckConfirmed!: boolean;

  @ApiProperty()
  @IsBoolean()
  @Equals(true)
  contentParityConfirmed!: boolean;

  @ApiProperty()
  @IsBoolean()
  @Equals(true)
  linksAndMetadataConfirmed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
