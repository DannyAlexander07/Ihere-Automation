import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ChangeOwnCredentialsDto {
  @ApiProperty({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(5, 128)
  currentPassword!: string;

  @ApiProperty({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  newPassword!: string;
}
