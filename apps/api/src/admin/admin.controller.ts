import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireTenantPermissions } from '../common/decorators/tenant-permissions.decorator';
import { AdminService } from './admin.service';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { ChangeUserStatusDto } from './dto/change-user-status.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminAuditDto } from './dto/list-admin-audit.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ReplaceUserAccessDto } from './dto/replace-user-access.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@ApiTags('Administración')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @RequireTenantPermissions('users.manage')
  listUsers(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: ListAdminUsersDto,
  ) {
    return this.admin.listUsers(principal, query);
  }

  @Get('users/:id')
  @RequireTenantPermissions('users.manage')
  getUser(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.getUser(principal, id);
  }

  @Post('users')
  @RequireTenantPermissions('users.manage')
  createUser(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: CreateAdminUserDto,
  ) {
    return this.admin.createUser(principal, input);
  }

  @Patch('users/:id')
  @RequireTenantPermissions('users.manage')
  updateUser(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateAdminUserDto,
  ) {
    return this.admin.updateUser(principal, id, input);
  }

  @Patch('users/:id/status')
  @RequireTenantPermissions('users.manage')
  changeUserStatus(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ChangeUserStatusDto,
  ) {
    return this.admin.changeUserStatus(principal, id, input);
  }

  @Post('users/:id/sessions/revoke')
  @RequireTenantPermissions('users.manage')
  revokeSessions(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.revokeSessions(principal, id);
  }

  @Patch('users/:id/password')
  @RequireTenantPermissions('users.manage')
  resetPassword(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResetUserPasswordDto,
  ) {
    return this.admin.resetPassword(principal, id, input);
  }

  @Put('users/:id/access')
  @RequireTenantPermissions('users.manage', 'roles.manage')
  replaceAutomationAccess(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReplaceUserAccessDto,
  ) {
    return this.admin.replaceAutomationAccess(principal, id, input);
  }

  @Post('users/:id/roles')
  @RequireTenantPermissions('users.manage', 'roles.manage')
  assignRole(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignUserRoleDto,
  ) {
    return this.admin.assignRole(principal, id, input);
  }

  @Delete('users/:id/roles/:assignmentId')
  @RequireTenantPermissions('users.manage', 'roles.manage')
  removeRole(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.admin.removeRole(principal, id, assignmentId);
  }

  @Get('roles')
  @RequireTenantPermissions('users.manage', 'roles.manage')
  listRoles(@CurrentUser() principal: AuthPrincipal) {
    return this.admin.listRoles(principal);
  }

  @Get('clients')
  @RequireTenantPermissions('users.manage', 'roles.manage')
  listClients(@CurrentUser() principal: AuthPrincipal) {
    return this.admin.listClients(principal);
  }

  @Get('audit')
  @RequireTenantPermissions('audit.read')
  listAudit(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: ListAdminAuditDto,
  ) {
    return this.admin.listAudit(principal, query);
  }
}
