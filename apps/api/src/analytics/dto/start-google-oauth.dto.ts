import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartGoogleOAuthDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  returnPath?: string;
}
