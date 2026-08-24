import { IsEnum } from 'class-validator';
import { LearningRuleStatus } from '../../generated/prisma/client';

export class UpdateLearningRuleStatusDto {
  @IsEnum(LearningRuleStatus)
  status!: LearningRuleStatus;
}
