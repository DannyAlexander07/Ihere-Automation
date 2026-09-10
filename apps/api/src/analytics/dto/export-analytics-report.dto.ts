import { IsIn, IsUUID, Matches } from 'class-validator';

export class ExportAnalyticsReportDto {
  @IsUUID()
  clientId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsIn(['DOCX', 'PDF'])
  format!: 'DOCX' | 'PDF';
}
