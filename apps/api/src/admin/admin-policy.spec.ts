import {
  isTenantAdministrator,
  roleCanBeAssignedToClient,
} from './admin-policy';

const assignment = (clientId: string | null, permissions: string[]) => ({
  clientId,
  role: {
    rolePermissions: permissions.map((code) => ({ permission: { code } })),
  },
});

describe('admin policy', () => {
  it('impide asignar permisos organizacionales a un cliente', () => {
    expect(roleCanBeAssignedToClient(['titles.read', 'users.manage'])).toBe(
      false,
    );
    expect(roleCanBeAssignedToClient(['titles.read', 'notes.edit'])).toBe(true);
  });

  it('considera administrador solo a quien reúne ambos permisos globales', () => {
    expect(
      isTenantAdministrator([
        assignment(null, ['users.manage']),
        assignment(null, ['roles.manage']),
      ]),
    ).toBe(true);
    expect(
      isTenantAdministrator([
        assignment('client-1', ['users.manage', 'roles.manage']),
      ]),
    ).toBe(false);
  });
});
