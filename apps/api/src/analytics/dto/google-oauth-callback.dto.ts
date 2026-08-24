import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleOAuthCallbackDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  state!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4_000)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  iss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  authuser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  hd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  prompt?: string;
}
