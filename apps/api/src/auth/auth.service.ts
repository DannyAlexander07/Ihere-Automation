import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import { AuditActorType, Prisma, UserStatus } from '../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { LoginAliasService } from './login-alias.service';
import type { ChangeOwnCredentialsDto } from './dto/change-own-credentials.dto';
import type { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  sessionId: string;
  authVersion: number;
}

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

type LoginFailureReason =
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'MFA_REQUIRED'
  | 'INVALID_PASSWORD';

type RefreshFailureReason =
  | 'MISSING_TOKEN'
  | 'TOKEN_UNKNOWN'
  | 'TOKEN_REUSED'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'USER_INACTIVE'
  | 'MFA_REQUIRED'
  | 'TENANT_MISMATCH';

const AUDIT_CONTEXT_LIMITS = {
  ipAddress: 64,
  requestId: 100,
  userAgent: 500,
} as const;

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$gAru7+JdBm0iKi5Ogk9/eQ$P+CHkwJNrp9DpsgkyW+6An4INGQfhQUaw5jOivtNnhM';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    permissions: string[];
    tenantPermissions: string[];
    clientPermissions: Record<string, string[]>;
    clientIds: string[];
  };
}

const userAccessInclude = {
  roles: {
    include: {
      client: { select: { tenantId: true, active: true } },
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  },
} as const;

type AccessUser = Prisma.UserGetPayload<{ include: typeof userAccessInclude }>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly aliases: LoginAliasService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginDto, context: RequestContext): Promise<AuthResult> {
    const auditContext = this.normalizeAuditContext(context);
    const tenantCode =
      input.tenantCode ?? this.config.getOrThrow<string>('DEFAULT_TENANT_CODE');
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: tenantCode },
    });
    if (!tenant?.active) {
      await verify(DUMMY_PASSWORD_HASH, input.password);
      if (tenant) {
        await this.recordAuthFailure(
          tenant.id,
          'auth.login.failed',
          'TENANT_INACTIVE',
          auditContext,
        );
      } else {
        this.logUnattributedFailure(
          'auth.login.failed',
          'TENANT_NOT_FOUND',
          auditContext,
        );
      }
      throw this.invalidCredentials();
    }

    const legacyTestDni =
      this.config.get<string>('NODE_ENV') === 'test' ? input.dni : undefined;
    const user = input.email
      ? await this.prisma.user.findFirst({
          where: {
            tenantId: tenant.id,
            email: this.aliases.normalizeEmail(input.email),
          },
          include: userAccessInclude,
        })
      : legacyTestDni
        ? await this.prisma.user.findUnique({
            where: {
              tenantId_loginAliasDigest: {
                tenantId: tenant.id,
                loginAliasDigest: this.aliases.digestDni(legacyTestDni),
              },
            },
            include: userAccessInclude,
          })
        : null;
    const passwordValid = await verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.mfaRequired ||
      !passwordValid
    ) {
      const reason: LoginFailureReason = !user
        ? 'USER_NOT_FOUND'
        : user.status !== UserStatus.ACTIVE
          ? 'USER_INACTIVE'
          : user.mfaRequired
            ? 'MFA_REQUIRED'
            : 'INVALID_PASSWORD';
      await this.recordAuthFailure(
        tenant.id,
        'auth.login.failed',
        reason,
        auditContext,
        user?.id,
      );
      throw this.invalidCredentials();
    }

    const refreshToken = this.createOpaqueToken();
    const expiresAt = this.refreshExpiry();
    const session = await this.prisma.session.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        refreshTokenDigest: this.digestToken(refreshToken),
        expiresAt,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      tenantId: tenant.id,
      userId: user.id,
      action: 'auth.login.succeeded',
      entityType: 'session',
      entityId: session.id,
      ...auditContext,
    });

    return this.buildResult(user, session.id, refreshToken);
  }

  async refresh(
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<AuthResult> {
    const auditContext = this.normalizeAuditContext(context);
    if (!refreshToken) {
      this.logUnattributedFailure(
        'auth.refresh.failed',
        'MISSING_TOKEN',
        auditContext,
      );
      throw this.invalidCredentials();
    }
    const digest = this.digestToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenDigest: digest },
      include: { user: { include: userAccessInclude } },
    });
    if (!session) {
      const consumed = await this.prisma.consumedRefreshToken.findUnique({
        where: { digest },
        select: {
          session: {
            select: {
              id: true,
              tenantId: true,
              userId: true,
              revokedAt: true,
            },
          },
        },
      });
      if (consumed) {
        await this.revokeCompromisedSession(consumed.session, auditContext);
      } else {
        this.logUnattributedFailure(
          'auth.refresh.failed',
          'TOKEN_UNKNOWN',
          auditContext,
        );
      }
      throw this.invalidCredentials();
    }
    const failureReason: RefreshFailureReason | undefined = session.revokedAt
      ? 'SESSION_REVOKED'
      : session.expiresAt <= new Date()
        ? 'SESSION_EXPIRED'
        : session.user.status !== UserStatus.ACTIVE
          ? 'USER_INACTIVE'
          : session.user.mfaRequired
            ? 'MFA_REQUIRED'
            : session.user.tenantId !== session.tenantId
              ? 'TENANT_MISMATCH'
              : undefined;
    if (failureReason) {
      await this.recordAuthFailure(
        session.tenantId,
        'auth.refresh.failed',
        failureReason,
        auditContext,
        session.userId,
        session.id,
      );
      throw this.invalidCredentials();
    }

    const rotatedToken = this.createOpaqueToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: {
          id: session.id,
          refreshTokenDigest: digest,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          refreshTokenDigest: this.digestToken(rotatedToken),
          expiresAt: this.refreshExpiry(),
          lastUsedAt: new Date(),
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        },
      });
      if (claimed.count !== 1) return false;
      await tx.consumedRefreshToken.create({
        data: { sessionId: session.id, digest },
      });
      return true;
    });
    if (!rotated) {
      await this.revokeCompromisedSession(session, auditContext);
      throw this.invalidCredentials();
    }
    return this.buildResult(session.user, session.id, rotatedToken);
  }

  async logout(
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    const auditContext = this.normalizeAuditContext(context);
    if (!refreshToken) return;
    const digest = this.digestToken(refreshToken);
    const session =
      (await this.prisma.session.findUnique({
        where: { refreshTokenDigest: digest },
      })) ??
      (
        await this.prisma.consumedRefreshToken.findUnique({
          where: { digest },
          select: { session: true },
        })
      )?.session;
    if (!session || session.revokedAt) return;
    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) return;
    await this.audit.record({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: session.id,
      metadata: { reason: 'USER_REQUESTED' },
      ...auditContext,
    });
  }

  async me(principal: AuthPrincipal) {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, tenantId: principal.tenantId },
      include: userAccessInclude,
    });
    if (!user) throw this.invalidCredentials();
    return this.presentUser(user);
  }

  async updateOwnProfile(principal: AuthPrincipal, input: UpdateOwnProfileDto) {
    const hasName = input.displayName !== undefined;
    const hasEmail = Object.prototype.hasOwnProperty.call(input, 'email');
    if (!hasName && !hasEmail)
      throw new BadRequestException('No se enviaron cambios para guardar.');
    const displayName = input.displayName?.trim().replace(/\s+/g, ' ');
    const email = input.email
      ? this.aliases.normalizeEmail(input.email)
      : undefined;
    if (email) {
      const duplicate = await this.prisma.user.findFirst({
        where: {
          tenantId: principal.tenantId,
          id: { not: principal.userId },
          email: { equals: email, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException('El correo ya está registrado.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.user.findFirst({
          where: { id: principal.userId, tenantId: principal.tenantId },
          select: { displayName: true, email: true },
        });
        if (!current) throw this.invalidCredentials();
        await tx.user.update({
          where: { id: principal.userId },
          data: {
            ...(hasName ? { displayName } : {}),
            ...(hasEmail
              ? { email, loginAliasDigest: this.aliases.digestEmail(email!) }
              : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            userId: principal.userId,
            actorType: AuditActorType.USER,
            action: 'auth.profile.updated',
            entityType: 'User',
            entityId: principal.userId,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            before: current,
            after: {
              displayName: hasName ? displayName : current.displayName,
              email: hasEmail ? email : current.email,
            },
          },
        });
      });
    } catch (error) {
      if (this.errorCode(error) === 'P2002')
        throw new ConflictException('El correo ya está registrado.');
      throw error;
    }
    return this.me(principal);
  }

  async changeOwnCredentials(
    principal: AuthPrincipal,
    input: ChangeOwnCredentialsDto,
  ) {
    const current = await this.prisma.user.findFirst({
      where: { id: principal.userId, tenantId: principal.tenantId },
      select: { id: true, passwordHash: true },
    });
    if (
      !current ||
      !(await verify(current.passwordHash, input.currentPassword))
    )
      throw new UnauthorizedException('La contraseña actual no es correcta.');

    const passwordHash = await hash(input.newPassword, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: principal.userId },
        data: { passwordHash },
      });
      const revoked = await tx.session.updateMany({
        where: {
          userId: principal.userId,
          id: { not: principal.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          userId: principal.userId,
          actorType: AuditActorType.USER,
          action: 'auth.credentials.changed',
          entityType: 'User',
          entityId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          after: {
            passwordChanged: true,
            revokedSessions: revoked.count,
          },
        },
      });
      return revoked.count;
    });
    return { success: true, revokedSessions };
  }

  async validateAccessToken(token: string): Promise<AuthPrincipal> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw this.invalidCredentials();
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: { include: userAccessInclude } },
    });
    if (
      !session ||
      session.tenantId !== payload.tenantId ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.mfaRequired ||
      session.user.tenantId !== session.tenantId ||
      session.user.authVersion !== payload.authVersion
    ) {
      throw this.invalidCredentials();
    }

    const access = this.accessFor(session.user);
    return {
      userId: session.user.id,
      tenantId: session.tenantId,
      sessionId: session.id,
      displayName: session.user.displayName,
      ...access,
    };
  }

  private async buildResult(
    user: AccessUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthResult> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tenantId: user.tenantId,
        sessionId,
        authVersion: user.authVersion,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn,
      },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: this.presentUser(user),
    };
  }

  private presentUser(user: AccessUser) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      ...this.accessFor(user),
    };
  }

  private accessFor(user: AccessUser) {
    const validAssignments = user.roles.filter(
      (item) =>
        item.role.tenantId === user.tenantId &&
        (!item.clientId ||
          (item.client?.tenantId === user.tenantId && item.client.active)),
    );
    const tenantPermissions = [
      ...new Set(
        validAssignments
          .filter((item) => !item.clientId)
          .flatMap((item) =>
            item.role.rolePermissions.map((rp) => rp.permission.code),
          ),
      ),
    ];
    const clientPermissions = validAssignments.reduce<Record<string, string[]>>(
      (result, item) => {
        if (!item.clientId) return result;
        result[item.clientId] = [
          ...new Set([
            ...(result[item.clientId] ?? []),
            ...item.role.rolePermissions.map((rp) => rp.permission.code),
          ]),
        ];
        return result;
      },
      {},
    );
    return {
      permissions: [
        ...new Set([
          ...tenantPermissions,
          ...Object.values(clientPermissions).flat(),
        ]),
      ],
      tenantPermissions,
      clientPermissions,
      clientIds: Object.keys(clientPermissions),
    };
  }

  private createOpaqueToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private async revokeCompromisedSession(
    session: {
      id: string;
      tenantId: string;
      userId: string;
      revokedAt: Date | null;
    },
    context: RequestContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 1) {
        await tx.user.update({
          where: { id: session.userId },
          data: { authVersion: { increment: 1 } },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: session.tenantId,
          userId: session.userId,
          actorType: 'SYSTEM',
          action: 'auth.refresh.reuse_detected',
          entityType: 'session',
          entityId: session.id,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { reason: 'TOKEN_REUSED' },
        },
      });
    });
  }

  private async recordAuthFailure(
    tenantId: string,
    action: 'auth.login.failed' | 'auth.refresh.failed',
    reason: LoginFailureReason | RefreshFailureReason,
    context: RequestContext,
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      userId,
      actorType: AuditActorType.SYSTEM,
      action,
      entityType: sessionId ? 'session' : 'authentication',
      entityId: sessionId,
      metadata: { reason },
      ...context,
    });
  }

  private logUnattributedFailure(
    action: 'auth.login.failed' | 'auth.refresh.failed',
    reason: LoginFailureReason | RefreshFailureReason,
    context: RequestContext,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: action,
        reason,
        ...context,
      }),
    );
  }

  private normalizeAuditContext(context: RequestContext): RequestContext {
    return {
      ipAddress: this.truncateContextValue(
        context.ipAddress,
        AUDIT_CONTEXT_LIMITS.ipAddress,
      ),
      requestId: this.truncateContextValue(
        context.requestId,
        AUDIT_CONTEXT_LIMITS.requestId,
      ),
      userAgent: this.truncateContextValue(
        context.userAgent,
        AUDIT_CONTEXT_LIMITS.userAgent,
      ),
    };
  }

  private truncateContextValue(
    value: string | undefined,
    maxLength: number,
  ): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, maxLength) : undefined;
  }

  private digestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private errorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return undefined;
    }

    return String((error as { code?: unknown }).code);
  }

  private refreshExpiry(): Date {
    const days = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    return new Date(Date.now() + days * 86_400_000);
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Credenciales o sesión no válidas.');
  }
}
