import {
  clientIdsForPermission,
  hasPermission,
  type AuthPrincipal,
} from './auth-principal';

describe('hasPermission', () => {
  const principal: AuthPrincipal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    displayName: 'Editora',
    permissions: ['titles.read', 'titles.edit'],
    tenantPermissions: ['titles.read'],
    clientPermissions: { 'client-a': ['titles.edit'] },
    clientIds: ['client-a'],
  };

  it('aplica permisos globales del tenant a sus clientes', () => {
    expect(hasPermission(principal, 'titles.read', 'client-b')).toBe(true);
  });

  it('no extiende un permiso de cliente hacia otro cliente', () => {
    expect(hasPermission(principal, 'titles.edit', 'client-a')).toBe(true);
    expect(hasPermission(principal, 'titles.edit', 'client-b')).toBe(false);
  });

  it('devuelve solo los clientes que contienen el permiso solicitado', () => {
    const scopedPrincipal: AuthPrincipal = {
      ...principal,
      tenantPermissions: [],
      clientPermissions: {
        'client-a': ['titles.read'],
        'client-b': ['notes.read'],
        'client-c': ['titles.read', 'notes.read'],
      },
      clientIds: ['client-a', 'client-b', 'client-c'],
    };
    expect(clientIdsForPermission(scopedPrincipal, 'titles.read')).toEqual([
      'client-a',
      'client-c',
    ]);
    expect(clientIdsForPermission(scopedPrincipal, 'notes.read')).toEqual([
      'client-b',
      'client-c',
    ]);
  });
});
