import { IsUUID } from 'class-validator';

export class AnalyticsClientDto {
  @IsUUID()
  clientId!: string;
}
