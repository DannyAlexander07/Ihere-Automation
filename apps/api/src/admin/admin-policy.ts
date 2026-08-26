export const TENANT_ONLY_PERMISSION_CODES = new Set([
  'users.manage',
  'roles.manage',
  'audit.read',
  'clients.manage',
  'clients.delete',
  'notes.export_html',
]);

export interface TenantRoleAssignment {
  clientId: string | null;
  role: {
    rolePermissions: Array<{ permission: { code: string } }>;
  };
}

export function roleCanBeAssignedToClient(permissionCodes: string[]): boolean {
  return permissionCodes.every(
    (permission) => !TENANT_ONLY_PERMISSION_CODES.has(permission),
  );
}

export function isTenantAdministrator(
  assignments: TenantRoleAssignment[],
): boolean {
  const permissions = new Set(
    assignments
      .filter((assignment) => assignment.clientId === null)
      .flatMap((assignment) =>
        assignment.role.rolePermissions.map((item) => item.permission.code),
      ),
  );
  return permissions.has('users.manage') && permissions.has('roles.manage');
}
