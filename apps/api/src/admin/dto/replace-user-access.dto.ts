import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export enum ModuleAccessLevel {
  NONE = 'NONE',
  READ = 'READ',
  EDIT = 'EDIT',
}

export class UserModuleAccessDto {
  @ApiProperty({ example: 'automation.titles', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, {
    message: 'El código del submódulo no tiene un formato válido.',
  })
  submoduleCode!: string;

  @ApiProperty({ enum: ModuleAccessLevel })
  @IsEnum(ModuleAccessLevel)
  level!: ModuleAccessLevel;

  @ApiProperty({ description: 'Aplica el acceso a todos los clientes.' })
  @IsBoolean()
  allClients!: boolean;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  clientIds!: string[];
}

export class ReplaceUserAccessDto {
  @ApiProperty({ type: [UserModuleAccessDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UserModuleAccessDto)
  accesses!: UserModuleAccessDto[];
}
