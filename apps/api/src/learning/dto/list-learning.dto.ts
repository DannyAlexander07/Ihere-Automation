import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { LearningRuleStatus } from '../../generated/prisma/client';

export class ListLearningDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(LearningRuleStatus)
  status?: LearningRuleStatus;
}
