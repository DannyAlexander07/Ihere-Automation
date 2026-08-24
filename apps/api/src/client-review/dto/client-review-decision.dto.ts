import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClientReviewDecisionType } from '../../generated/prisma/client';

export class ClientReviewDecisionDto {
  @IsEnum(ClientReviewDecisionType)
  type!: ClientReviewDecisionType;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;

  @IsEmail()
  @MaxLength(254)
  reviewerEmail!: string;
}
