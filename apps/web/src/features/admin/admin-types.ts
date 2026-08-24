export type UserStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export type AdminPermission = { code: string; description: string | null };

export type AdminRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: AdminPermission[];
  assignmentCount: number;
  clientAssignable: boolean;
};

export type AdminClient = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

export type RoleAssignment = {
  id: string;
  grantedAt: string;
  grantedBy: { id: string; displayName: string } | null;
  client: { id: string; name: string; active: boolean } | null;
  role: Omit<AdminRole, "assignmentCount" | "clientAssignable">;
};

export type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  mfaRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  activeSessionCount: number;
  roles: RoleAssignment[];
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AuditEntry = {
  id: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  user: { id: string; displayName: string; email: string | null } | null;
  client: { id: string; name: string } | null;
};
