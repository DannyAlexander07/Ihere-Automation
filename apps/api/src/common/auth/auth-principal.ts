export interface AuthPrincipal {
  userId: string;
  tenantId: string;
  sessionId: string;
  displayName: string;
  permissions: string[];
  tenantPermissions: string[];
  clientPermissions: Record<string, string[]>;
  clientIds: string[];
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function hasPermission(
  principal: AuthPrincipal,
  permission: string,
  clientId?: string,
): boolean {
  if (principal.tenantPermissions.includes(permission)) return true;
  return Boolean(
    clientId && principal.clientPermissions[clientId]?.includes(permission),
  );
}

export function clientIdsForPermission(
  principal: AuthPrincipal,
  permission: string,
): string[] {
  return Object.entries(principal.clientPermissions)
    .filter(([, permissions]) => permissions.includes(permission))
    .map(([clientId]) => clientId);
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal;
    ihereRequestId?: string;
  }
}
