import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GlossaryEntryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  preferredTerm!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  variants!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  guidance?: string;
}

export class EditorialGlossaryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GlossaryEntryDto)
  entries!: GlossaryEntryDto[];
}

export class CreateLearningRuleDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  code!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  signalIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => EditorialGlossaryDto)
  glossary?: EditorialGlossaryDto;
}
