import { SetMetadata } from '@nestjs/common';

export const TENANT_PERMISSIONS_KEY = 'tenant_permissions';

/**
 * Requires permissions granted at organization scope. A permission assigned to
 * one client is intentionally insufficient for these operations.
 */
export const RequireTenantPermissions = (...permissions: string[]) =>
  SetMetadata(TENANT_PERMISSIONS_KEY, permissions);
