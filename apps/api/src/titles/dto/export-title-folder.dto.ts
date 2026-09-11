import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ExportTitleFolderDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  folderKey!: string;

  @IsIn(['DOCX', 'PDF'])
  format!: 'DOCX' | 'PDF';
}
