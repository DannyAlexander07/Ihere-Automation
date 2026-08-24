import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TitleStatus } from '../../generated/prisma/client';

export class ListTitlesDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(TitleStatus)
  status?: TitleStatus;
}
