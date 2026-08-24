import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @ApiProperty({ minLength: 5, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  password!: string;
}
