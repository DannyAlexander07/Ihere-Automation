import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireTenantPermissions } from '../common/decorators/tenant-permissions.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@RequirePermissions('clients.read')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.clients.list(principal);
  }

  @Post()
  @RequireTenantPermissions('clients.manage')
  create(
    @Body() input: CreateClientDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.clients.create(input, principal);
  }

  @Patch(':id')
  @RequireTenantPermissions('clients.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateClientDto,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.clients.update(id, input, principal);
  }

  @Delete(':id')
  @RequireTenantPermissions('clients.delete')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.clients.remove(id, principal);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.clients.get(id, principal);
  }
}
