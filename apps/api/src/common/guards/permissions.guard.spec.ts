import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth-principal';
import { PermissionsGuard } from './permissions.guard';

function context(principal?: AuthPrincipal): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ principal }),
    }),
  } as unknown as ExecutionContext;
}

const principal: AuthPrincipal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  sessionId: 'session-1',
  displayName: 'Administración',
  permissions: ['users.manage', 'titles.read'],
  tenantPermissions: ['titles.read'],
  clientPermissions: { 'client-1': ['users.manage'] },
  clientIds: ['client-1'],
};

describe('PermissionsGuard', () => {
  it('no acepta como tenant-wide un permiso obtenido solo en un cliente', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(['users.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(context(principal))).toThrow(
      ForbiddenException,
    );
  });

  it('acepta permisos tenant-wide explícitos y permisos ordinarios', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(['titles.read'])
        .mockReturnValueOnce(['titles.read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context(principal))).toBe(true);
  });

  it('mantiene públicas las rutas sin metadatos de permisos', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context())).toBe(true);
  });
});
