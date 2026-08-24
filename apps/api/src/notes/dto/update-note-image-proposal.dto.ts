import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateNoteImageProposalDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  concept!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  prompt!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(320)
  altText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  caption?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  referenceUrl?: string;
}
