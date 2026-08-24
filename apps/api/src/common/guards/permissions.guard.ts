import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { TENANT_PERMISSIONS_KEY } from '../decorators/tenant-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredTenant = this.reflector.getAllAndOverride<string[]>(
      TENANT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length && !requiredTenant?.length) return true;

    const principal = context
      .switchToHttp()
      .getRequest<FastifyRequest>().principal;
    if (
      !principal ||
      !(
        required?.every((permission) =>
          principal.permissions.includes(permission),
        ) ?? true
      ) ||
      !(
        requiredTenant?.every((permission) =>
          principal.tenantPermissions.includes(permission),
        ) ?? true
      )
    ) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción.',
      );
    }
    return true;
  }
}
