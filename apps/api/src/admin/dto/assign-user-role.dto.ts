import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignUserRoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Cliente al que se limita el rol. Omitir para una asignación organizacional.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;
}
