import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class NoteVersionCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  expectedVersion!: number;
}
