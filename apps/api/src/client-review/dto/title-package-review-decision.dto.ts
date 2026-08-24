import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ClientReviewDecisionType } from '../../generated/prisma/client';

export class TitlePackageItemDecisionDto {
  @IsUUID()
  proposalId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsEnum(ClientReviewDecisionType)
  type!: ClientReviewDecisionType;

  @ValidateIf(
    (decision: TitlePackageItemDecisionDto) =>
      decision.type === ClientReviewDecisionType.REQUEST_CHANGES ||
      decision.type === ClientReviewDecisionType.REJECT,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason?: string;
}

export class TitlePackageReviewDecisionDto {
  @IsEmail()
  @MaxLength(254)
  reviewerEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TitlePackageItemDecisionDto)
  decisions!: TitlePackageItemDecisionDto[];
}
