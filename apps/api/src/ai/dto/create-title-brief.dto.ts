import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

const titleSearchIntents = [
  'Aprender',
  'Comparar',
  'Decidir',
  'Contratar',
  'Resolver',
] as const;

export class CreateTitleBriefDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ minimum: 2020, maximum: 2100 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  campaignYear!: number;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  campaignMonth!: number;

  @ApiProperty({ enum: titleSearchIntents })
  @IsString()
  @IsIn(titleSearchIntents)
  searchIntent!: (typeof titleSearchIntents)[number];
}
