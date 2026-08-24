import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { LoginAliasService } from '../auth/login-alias.service';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import { AuditActorType, Prisma, UserStatus } from '../generated/prisma/client';
import {
  isTenantAdministrator,
  roleCanBeAssignedToClient,
} from './admin-policy';
import type { AssignUserRoleDto } from './dto/assign-user-role.dto';
import type { ChangeUserStatusDto } from './dto/change-user-status.dto';
import type { CreateAdminUserDto } from './dto/create-admin-user.dto';
import type { ListAdminAuditDto } from './dto/list-admin-audit.dto';
import type { ListAdminUsersDto } from './dto/list-admin-users.dto';
import {
  ModuleAccessLevel,
  type ReplaceUserAccessDto,
} from './dto/replace-user-access.dto';
import type { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import type { UpdateAdminUserDto } from './dto/update-admin-user.dto';

const readerRoleCode = (submoduleCode: string) => `${submoduleCode}.reader`;

const assignmentInclude = {
  client: { select: { id: true, name: true, active: true } },
  grantor: { select: { id: true, displayName: true } },
  role: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isSystem: true,
      rolePermissions: {
        select: {
          permission: { select: { code: true, description: true } },
        },
      },
    },
  },
} satisfies Prisma.UserRoleInclude;

const adminUserSelect = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  mfaRequired: true,
  authVersion: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { include: assignmentInclude, orderBy: { grantedAt: 'desc' } },
  sessions: {
    where: { revokedAt: null },
    select: { id: true, expiresAt: true },
  },
} satisfies Prisma.UserSelect;

type AdminUserRecord = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

type Transaction = Prisma.TransactionClient;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: LoginAliasService,
  ) {}

  async listUsers(principal: AuthPrincipal, query: ListAdminUsersDto) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      tenantId: principal.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const count = await tx.user.count({ where });
      return [users, count] as const;
    });
    return {
      items: items.map((user) => this.presentUser(user)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getUser(principal: AuthPrincipal, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: principal.tenantId },
      select: adminUserSelect,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return this.presentUser(user);
  }

  async createUser(principal: AuthPrincipal, input: CreateAdminUserDto) {
    const displayName = this.normalizedName(input.displayName);
    const email = this.normalizedEmail(input.email);
    const loginAliasDigest = this.aliases.digestDni(input.dni);
    const duplicate = await this.prisma.user.findFirst({
      where: {
        tenantId: principal.tenantId,
        OR: [
          { loginAliasDigest },
          ...(email
            ? [{ email: { equals: email, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException('El DNI o correo ya está registrado.');

    const passwordHash = await this.passwordHash(input.password);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: principal.tenantId,
            loginAliasDigest,
            displayName,
            email,
            passwordHash,
          },
          select: adminUserSelect,
        });
        await tx.auditLog.create({
          data: this.auditData(principal, {
            action: 'admin.user.created',
            entityType: 'User',
            entityId: user.id,
            after: this.userAuditSnapshot(user),
          }),
        });
        return user;
      });
      return this.presentUser(created);
    } catch (error) {
      if (this.errorCode(error) === 'P2002')
        throw new ConflictException('El DNI o correo ya está registrado.');
      throw error;
    }
  }

  async updateUser(
    principal: AuthPrincipal,
    id: string,
    input: UpdateAdminUserDto,
  ) {
    const hasName = input.displayName !== undefined;
    const hasEmail = Object.prototype.hasOwnProperty.call(input, 'email');
    if (!hasName && !hasEmail)
      throw new BadRequestException('No se enviaron cambios para guardar.');

    const current = await this.findUser(this.prisma, principal.tenantId, id);
    const data: Prisma.UserUpdateInput = {};
    if (hasName) data.displayName = this.normalizedName(input.displayName!);
    if (hasEmail) {
      data.email = this.normalizedEmail(input.email);
      if (data.email) {
        const duplicate = await this.prisma.user.findFirst({
          where: {
            tenantId: principal.tenantId,
            id: { not: id },
            email: { equals: data.email, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException('El correo ya está registrado.');
      }
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: current.id },
          data,
          select: adminUserSelect,
        });
        await tx.auditLog.create({
          data: this.auditData(principal, {
            action: 'admin.user.updated',
            entityType: 'User',
            entityId: user.id,
            before: this.userAuditSnapshot(current),
            after: this.userAuditSnapshot(user),
          }),
        });
        return user;
      });
      return this.presentUser(updated);
    } catch (error) {
      if (this.errorCode(error) === 'P2002')
        throw new ConflictException('El correo ya está registrado.');
      throw error;
    }
  }

  async changeUserStatus(
    principal: AuthPrincipal,
    id: string,
    input: ChangeUserStatusDto,
  ) {
    if (id === principal.userId && input.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('No puedes suspender tu propia cuenta.');

    return this.serializable(async (tx) => {
      const current = await this.findUser(tx, principal.tenantId, id);
      if (current.status === input.status) return this.presentUser(current);
      if (
        current.status === UserStatus.ACTIVE &&
        input.status !== UserStatus.ACTIVE &&
        isTenantAdministrator(current.roles)
      ) {
        await this.assertAnotherAdministrator(tx, principal.tenantId, id);
      }

      const now = new Date();
      const revoked =
        input.status === UserStatus.ACTIVE
          ? { count: 0 }
          : await tx.session.updateMany({
              where: { userId: id, revokedAt: null },
              data: { revokedAt: now },
            });
      const user = await tx.user.update({
        where: { id },
        data: { status: input.status, authVersion: { increment: 1 } },
        select: adminUserSelect,
      });
      await tx.auditLog.create({
        data: this.auditData(principal, {
          action: 'admin.user.status.changed',
          entityType: 'User',
          entityId: id,
          before: this.userAuditSnapshot(current),
          after: {
            ...this.userAuditSnapshot(user),
            revokedSessions: revoked.count,
          },
        }),
      });
      return this.presentUser(user);
    });
  }

  async listRoles(principal: AuthPrincipal) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: principal.tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        rolePermissions: {
          select: { permission: { select: { code: true, description: true } } },
          orderBy: { permission: { code: 'asc' } },
        },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((role) => {
      const permissions = role.rolePermissions.map((item) => item.permission);
      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions,
        assignmentCount: role._count.users,
        clientAssignable: roleCanBeAssignedToClient(
          permissions.map((permission) => permission.code),
        ),
      };
    });
  }

  async listClients(principal: AuthPrincipal) {
    return this.prisma.client.findMany({
      where: { tenantId: principal.tenantId },
      select: { id: true, slug: true, name: true, active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async assignRole(
    principal: AuthPrincipal,
    userId: string,
    input: AssignUserRoleDto,
  ) {
    return this.serializable(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, tenantId: principal.tenantId },
        select: { id: true },
      });
      const role = await tx.role.findFirst({
        where: { id: input.roleId, tenantId: principal.tenantId },
        select: {
          id: true,
          code: true,
          name: true,
          rolePermissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      });
      const client = input.clientId
        ? await tx.client.findFirst({
            where: {
              id: input.clientId,
              tenantId: principal.tenantId,
              active: true,
            },
            select: { id: true, name: true },
          })
        : null;
      if (!user) throw new NotFoundException('Usuario no encontrado.');
      if (!role) throw new NotFoundException('Rol no encontrado.');
      if (input.clientId && !client)
        throw new NotFoundException('Cliente activo no encontrado.');

      const permissionCodes = role.rolePermissions.map(
        (item) => item.permission.code,
      );
      if (input.clientId && !roleCanBeAssignedToClient(permissionCodes)) {
        throw new BadRequestException(
          'Este rol contiene permisos organizacionales y no puede limitarse a un cliente.',
        );
      }
      const existing = await tx.userRole.findFirst({
        where: {
          userId,
          roleId: role.id,
          clientId: input.clientId ?? null,
        },
        select: { id: true },
      });
      if (existing)
        throw new ConflictException('El usuario ya tiene esta asignación.');

      const assignment = await tx.userRole.create({
        data: {
          userId,
          roleId: role.id,
          clientId: input.clientId ?? null,
          grantedBy: principal.userId,
        },
        include: assignmentInclude,
      });
      const revoked = await this.invalidateSessions(tx, userId);
      await tx.auditLog.create({
        data: this.auditData(principal, {
          clientId: input.clientId ?? undefined,
          action: 'admin.user.role.assigned',
          entityType: 'UserRole',
          entityId: assignment.id,
          after: {
            userId,
            roleId: role.id,
            roleCode: role.code,
            clientId: input.clientId ?? null,
            revokedSessions: revoked,
          },
        }),
      });
      return this.presentAssignment(assignment);
    });
  }

  async removeRole(
    principal: AuthPrincipal,
    userId: string,
    assignmentId: string,
  ) {
    return this.serializable(async (tx) => {
      const assignment = await tx.userRole.findFirst({
        where: {
          id: assignmentId,
          userId,
          user: { tenantId: principal.tenantId },
        },
        include: assignmentInclude,
      });
      if (!assignment)
        throw new NotFoundException('Asignación de rol no encontrada.');

      const permissionCodes = assignment.role.rolePermissions.map(
        (item) => item.permission.code,
      );
      const removesAdministrativeAccess =
        assignment.clientId === null &&
        permissionCodes.some((code) =>
          ['users.manage', 'roles.manage'].includes(code),
        );
      if (userId === principal.userId && removesAdministrativeAccess)
        throw new ForbiddenException(
          'No puedes retirar tu propia asignación administrativa.',
        );

      const current = await this.findUser(tx, principal.tenantId, userId);
      const remaining = current.roles.filter(
        (item) => item.id !== assignmentId,
      );
      if (
        isTenantAdministrator(current.roles) &&
        !isTenantAdministrator(remaining)
      ) {
        await this.assertAnotherAdministrator(tx, principal.tenantId, userId);
      }

      await tx.userRole.delete({ where: { id: assignment.id } });
      const revoked = await this.invalidateSessions(tx, userId);
      await tx.auditLog.create({
        data: this.auditData(principal, {
          clientId: assignment.clientId ?? undefined,
          action: 'admin.user.role.removed',
          entityType: 'UserRole',
          entityId: assignment.id,
          before: {
            userId,
            roleId: assignment.roleId,
            roleCode: assignment.role.code,
            clientId: assignment.clientId,
          },
          after: { revokedSessions: revoked },
        }),
      });
      return { success: true, revokedSessions: revoked };
    });
  }

  async revokeSessions(principal: AuthPrincipal, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.findUser(tx, principal.tenantId, userId);
      const revoked = await this.invalidateSessions(tx, userId);
      await tx.auditLog.create({
        data: this.auditData(principal, {
          action: 'admin.user.sessions.revoked',
          entityType: 'User',
          entityId: userId,
          after: { revokedSessions: revoked },
        }),
      });
      return { success: true, revokedSessions: revoked };
    });
  }

  async resetPassword(
    principal: AuthPrincipal,
    userId: string,
    input: ResetUserPasswordDto,
  ) {
    const passwordHash = await this.passwordHash(input.password);
    return this.serializable(async (tx) => {
      await this.findUser(tx, principal.tenantId, userId);
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      const revoked = await this.invalidateSessions(tx, userId);
      await tx.auditLog.create({
        data: this.auditData(principal, {
          action: 'admin.user.password.reset',
          entityType: 'User',
          entityId: userId,
          after: { passwordChanged: true, revokedSessions: revoked },
        }),
      });
      return { success: true, revokedSessions: revoked };
    });
  }

  async replaceAutomationAccess(
    principal: AuthPrincipal,
    userId: string,
    input: ReplaceUserAccessDto,
  ) {
    const duplicated = input.accesses.find(
      (access, index) =>
        input.accesses.findIndex(
          (candidate) => candidate.submoduleCode === access.submoduleCode,
        ) !== index,
    );
    if (duplicated)
      throw new BadRequestException(
        `El submódulo ${duplicated.submoduleCode} está repetido.`,
      );

    return this.serializable(async (tx) => {
      const user = await this.findUser(tx, principal.tenantId, userId);
      const requestedClientIds = [
        ...new Set(input.accesses.flatMap((access) => access.clientIds)),
      ];
      if (requestedClientIds.length) {
        const clients = await tx.client.findMany({
          where: {
            id: { in: requestedClientIds },
            tenantId: principal.tenantId,
            active: true,
          },
          select: { id: true },
        });
        if (clients.length !== requestedClientIds.length)
          throw new BadRequestException(
            'Uno o más clientes no están activos en esta organización.',
          );
      }

      const roles = await tx.role.findMany({
        where: { tenantId: principal.tenantId, isSystem: true },
        select: {
          id: true,
          code: true,
          rolePermissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      });
      const roleByCode = new Map(roles.map((role) => [role.code, role]));
      const managedSubmoduleCodes = roles
        .filter((role) => role.code.endsWith('.reader'))
        .map((role) => role.code.slice(0, -'.reader'.length))
        .filter((code) => code.includes('.') && roleByCode.has(code));
      const managedRoleCodes = managedSubmoduleCodes.flatMap((code) => [
        code,
        readerRoleCode(code),
      ]);
      const desired: Array<{
        userId: string;
        roleId: string;
        clientId: string | null;
        grantedBy: string;
      }> = [];

      for (const access of input.accesses) {
        if (!managedSubmoduleCodes.includes(access.submoduleCode))
          throw new BadRequestException(
            `El submódulo ${access.submoduleCode} no pertenece al catálogo administrable.`,
          );
        if (access.level === ModuleAccessLevel.NONE) continue;
        const roleCode =
          access.level === ModuleAccessLevel.READ
            ? readerRoleCode(access.submoduleCode)
            : access.submoduleCode;
        const role = roleByCode.get(roleCode);
        if (!role)
          throw new ConflictException(
            'El catálogo de accesos no está actualizado. Ejecuta las migraciones y vuelve a intentar.',
          );

        const tenantOnlyRole = !roleCanBeAssignedToClient(
          role.rolePermissions.map((item) => item.permission.code),
        );
        const clientIds =
          access.allClients || tenantOnlyRole ? [null] : access.clientIds;
        if (!clientIds.length)
          throw new BadRequestException(
            `Selecciona al menos un cliente para ${access.submoduleCode}.`,
          );
        for (const clientId of clientIds) {
          desired.push({
            userId,
            roleId: role.id,
            clientId,
            grantedBy: principal.userId,
          });
        }
      }

      const before = user.roles
        .filter((assignment) => managedRoleCodes.includes(assignment.role.code))
        .map((assignment) => ({
          roleCode: assignment.role.code,
          clientId: assignment.clientId,
        }));
      await tx.userRole.deleteMany({
        where: {
          userId,
          role: { code: { in: managedRoleCodes } },
        },
      });
      if (desired.length) await tx.userRole.createMany({ data: desired });
      const revoked = await this.invalidateSessions(tx, userId);
      await tx.auditLog.create({
        data: this.auditData(principal, {
          action: 'admin.user.module_access.replaced',
          entityType: 'User',
          entityId: userId,
          before: { assignments: before },
          after: {
            assignments: desired.map((assignment) => ({
              roleId: assignment.roleId,
              clientId: assignment.clientId,
            })),
            revokedSessions: revoked,
          },
        }),
      });
      return this.presentUser(
        await this.findUser(tx, principal.tenantId, userId),
      );
    });
  }

  async listAudit(principal: AuthPrincipal, query: ListAdminAuditDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final.',
      );
    const where: Prisma.AuditLogWhereInput = {
      tenantId: principal.tenantId,
      ...(query.action
        ? { action: { contains: query.action.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType.trim() } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const logs = await tx.auditLog.findMany({
        where,
        select: {
          id: true,
          actorType: true,
          action: true,
          entityType: true,
          entityId: true,
          requestId: true,
          ipAddress: true,
          userAgent: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
          user: { select: { id: true, displayName: true, email: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const count = await tx.auditLog.count({ where });
      return [logs, count] as const;
    });
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  private async findUser(
    prisma: PrismaService | Transaction,
    tenantId: string,
    id: string,
  ): Promise<AdminUserRecord> {
    const user = await prisma.user.findFirst({
      where: { id, tenantId },
      select: adminUserSelect,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  private async assertAnotherAdministrator(
    tx: Transaction,
    tenantId: string,
    excludedUserId: string,
  ) {
    const candidates = await tx.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ACTIVE,
        id: { not: excludedUserId },
      },
      select: {
        roles: {
          where: { clientId: null },
          select: {
            clientId: true,
            role: {
              select: {
                rolePermissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!candidates.some((candidate) => isTenantAdministrator(candidate.roles)))
      throw new ConflictException(
        'Debe permanecer al menos otro administrador activo.',
      );
  }

  private async invalidateSessions(tx: Transaction, userId: string) {
    const now = new Date();
    const revoked = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    });
    return revoked.count;
  }

  private presentUser(user: AdminUserRecord) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      mfaRequired: user.mfaRequired,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      activeSessionCount: user.sessions.filter(
        (session) => session.expiresAt > new Date(),
      ).length,
      roles: user.roles.map((assignment) => this.presentAssignment(assignment)),
    };
  }

  private presentAssignment(assignment: AdminUserRecord['roles'][number]) {
    return {
      id: assignment.id,
      grantedAt: assignment.grantedAt,
      grantedBy: assignment.grantor,
      client: assignment.client,
      role: {
        id: assignment.role.id,
        code: assignment.role.code,
        name: assignment.role.name,
        description: assignment.role.description,
        isSystem: assignment.role.isSystem,
        permissions: assignment.role.rolePermissions.map(
          (item) => item.permission,
        ),
      },
    };
  }

  private userAuditSnapshot(user: AdminUserRecord) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      mfaRequired: user.mfaRequired,
      roleAssignmentIds: user.roles.map((role) => role.id),
    };
  }

  private auditData(
    principal: AuthPrincipal,
    event: {
      clientId?: string;
      action: string;
      entityType: string;
      entityId: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      actorType: AuditActorType.USER,
      clientId: event.clientId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      ...(event.before
        ? { before: event.before as Prisma.InputJsonObject }
        : {}),
      ...(event.after ? { after: event.after as Prisma.InputJsonObject } : {}),
    };
  }

  private normalizedName(value: string) {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < 2)
      throw new BadRequestException(
        'El nombre debe tener al menos 2 caracteres.',
      );
    return name;
  }

  private normalizedEmail(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  private passwordHash(password: string) {
    return hash(password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private errorCode(error: unknown) {
    return typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : undefined;
  }

  private async serializable<T>(operation: (tx: Transaction) => Promise<T>) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.errorCode(error) !== 'P2034') throw error;
        if (attempt === 1)
          throw new ConflictException(
            'La operación cambió concurrentemente. Inténtalo nuevamente.',
          );
      }
    }
    throw new ConflictException('La operación cambió concurrentemente.');
  }
}
