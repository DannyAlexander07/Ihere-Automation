import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TitleDecisionType } from '../../generated/prisma/client';

const packageDecisionTypes = [
  TitleDecisionType.APPROVE,
  TitleDecisionType.REQUEST_CHANGES,
  TitleDecisionType.REJECT,
] as const;

export class InternalTitlePackageItemDecisionDto {
  @IsUUID()
  proposalId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn(packageDecisionTypes)
  type!:
    | typeof TitleDecisionType.APPROVE
    | typeof TitleDecisionType.REQUEST_CHANGES
    | typeof TitleDecisionType.REJECT;

  @ValidateIf(
    (decision: InternalTitlePackageItemDecisionDto) =>
      decision.type !== TitleDecisionType.APPROVE,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason?: string;
}

export class InternalTitlePackageDecisionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => InternalTitlePackageItemDecisionDto)
  decisions!: InternalTitlePackageItemDecisionDto[];
}
