import type { AuthUser } from "./auth-provider";

export function hasClientPermission(
  user: AuthUser | null,
  permission: string,
  clientId: string,
): boolean {
  if (!user || !clientId) return false;
  return (
    user.tenantPermissions.includes(permission) ||
    (user.clientPermissions[clientId] ?? []).includes(permission)
  );
}
