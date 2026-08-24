import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { IdentityService } from '../src/identity/identity.service';
import { PrismaService } from '../src/database/prisma.service';

jest.setTimeout(60_000);

describe('I HERE administración (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let identity: IdentityService;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const password = 'Admin-e2e-2026!';
  let tenantId: string;
  let foreignTenantId: string;
  let foreignUserId: string;
  let tenantCode: string;
  let clientId: string;
  let administratorId: string;
  let operatorId: string;
  let administratorToken: string;
  let operatorToken: string;
  let editorRoleId: string;
  let dangerousRoleId: string;
  let loginSequence = 10;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    await app.register(cookie);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    identity = app.get(IdentityService);
    await prepareFixture();
  }, 60_000);

  it('rechaza un permiso administrativo limitado a un cliente', async () => {
    const scopedUser = await identity.createUser({
      tenantId,
      dni: '31000003',
      displayName: 'Administración limitada',
      password,
    });
    const scopedRole = await prisma.role.create({
      data: {
        tenantId,
        code: `scoped-admin-${suffix}`,
        name: 'Administración limitada E2E',
        rolePermissions: {
          create: {
            permission: { connect: { code: 'users.manage' } },
          },
        },
      },
    });
    await prisma.userRole.create({
      data: {
        userId: scopedUser.id,
        roleId: scopedRole.id,
        clientId,
        grantedBy: administratorId,
      },
    });
    const token = await login('31000003');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: authorization(token),
    });
    expect(response.statusCode).toBe(403);
  });

  it('no permite consultar usuarios de otra organización', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${foreignUserId}`,
      headers: authorization(administratorToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('crea, edita y lista usuarios sin exponer secretos', async () => {
    const weakPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: authorization(administratorToken),
      payload: {
        dni: '31000009',
        displayName: 'Contraseña débil',
        password: '1234',
      },
    });
    expect(weakPassword.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: authorization(administratorToken),
      payload: {
        dni: '31000004',
        displayName: '  Usuaria   administrada  ',
        email: 'USUARIA@MOOD.PE',
        password,
      },
    });
    expect(created.statusCode).toBe(201);
    const user = created.json<Record<string, unknown> & { id: string }>();
    expect(user).toMatchObject({
      displayName: 'Usuaria administrada',
      email: 'usuaria@mood.pe',
      status: 'ACTIVE',
    });
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('loginAliasDigest');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${user.id}`,
      headers: authorization(administratorToken),
      payload: { displayName: 'Usuaria revisada', email: null },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: user.id,
      displayName: 'Usuaria revisada',
      email: null,
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?search=Usuaria&page=1&pageSize=10',
      headers: authorization(administratorToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: Array<{ id: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: user.id })]),
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'admin.user.created', entityId: user.id },
    });
    expect(audit.after).not.toHaveProperty('password');
    expect(audit.after).not.toHaveProperty('passwordHash');
    expect(audit.after).not.toHaveProperty('loginAliasDigest');
  });

  it('asigna y retira roles, bloqueando permisos tenant-only por cliente', async () => {
    const created = await createManagedUser('31000005', 'Usuario de roles');
    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${created.id}/roles`,
      headers: authorization(administratorToken),
      payload: { roleId: editorRoleId, clientId },
    });
    expect(assigned.statusCode).toBe(201);
    const assignment = assigned.json<{ id: string }>();

    const unsafe = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${created.id}/roles`,
      headers: authorization(administratorToken),
      payload: { roleId: dangerousRoleId, clientId },
    });
    expect(unsafe.statusCode).toBe(400);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/users/${created.id}/roles/${assignment.id}`,
      headers: authorization(administratorToken),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ success: true });
  });

  it('revoca sesiones y las invalida de inmediato', async () => {
    const created = await createManagedUser('31000006', 'Usuario con sesión');
    const token = await login('31000006');
    const revoked = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${created.id}/sessions/revoke`,
      headers: authorization(administratorToken),
    });
    expect(revoked.statusCode).toBe(201);
    expect(revoked.json<{ revokedSessions: number }>().revokedSessions).toBe(1);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authorization(token),
    });
    expect(after.statusCode).toBe(401);
  });

  it('restablece una contraseña de 5 caracteres sin exponerla', async () => {
    const created = await createManagedUser('31000010', 'Usuario con clave');
    const previousToken = await login('31000010');
    const reset = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${created.id}/password`,
      headers: authorization(administratorToken),
      payload: { password: 'abcde' },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ success: true, revokedSessions: 1 });

    const previousSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authorization(previousToken),
    });
    expect(previousSession.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: nextLoginAddress(),
      payload: { tenantCode, dni: '31000010', password: 'abcde' },
    });
    expect(newLogin.statusCode).toBe(201);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId,
        action: 'admin.user.password.reset',
        entityId: created.id,
      },
    });
    expect(JSON.stringify(audit)).not.toContain('abcde');
  });

  it('reemplaza lectura y edición con alcance distinto por cliente', async () => {
    const created = await createManagedUser('31000011', 'Usuario matricial');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/users/${created.id}/access`,
      headers: authorization(administratorToken),
      payload: {
        accesses: [
          {
            submoduleCode: 'automation.titles',
            level: 'READ',
            allClients: false,
            clientIds: [clientId],
          },
          {
            submoduleCode: 'automation.notes',
            level: 'EDIT',
            allClients: true,
            clientIds: [],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    const assignedRoleCodes = response
      .json<{ roles: Array<{ role: { code: string } }> }>()
      .roles.map((assignment) => assignment.role.code);
    expect(assignedRoleCodes).toEqual(
      expect.arrayContaining(['automation.titles.reader', 'automation.notes']),
    );

    const token = await login('31000011');
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authorization(token),
    });
    const access = me.json<{
      tenantPermissions: string[];
      clientPermissions: Record<string, string[]>;
    }>();
    expect(access.tenantPermissions).toEqual(
      expect.arrayContaining(['notes.read', 'notes.edit']),
    );
    expect(access.clientPermissions[clientId]).toEqual(
      expect.arrayContaining(['titles.read']),
    );
    expect(access.clientPermissions[clientId]).not.toContain('titles.edit');
  });

  it('permite actualizar perfil, DNI y contraseña propios', async () => {
    const created = await createManagedUser('31000012', 'Perfil propio');
    const token = await login('31000012');
    const profile = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/profile',
      headers: authorization(token),
      payload: { displayName: 'Perfil actualizado', email: 'perfil@mood.pe' },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      id: created.id,
      displayName: 'Perfil actualizado',
      email: 'perfil@mood.pe',
    });

    const credentials = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me/credentials',
      headers: authorization(token),
      payload: {
        currentPassword: password,
        newDni: '31000013',
        newPassword: 'abcde',
      },
    });
    expect(credentials.statusCode).toBe(200);
    const currentSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authorization(token),
    });
    expect(currentSession.statusCode).toBe(200);
    const changedLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: nextLoginAddress(),
      payload: { tenantCode, dni: '31000013', password: 'abcde' },
    });
    expect(changedLogin.statusCode).toBe(201);
  });

  it('suspende y reactiva sin revivir las sesiones anteriores', async () => {
    const created = await createManagedUser('31000007', 'Usuario suspendible');
    const oldToken = await login('31000007');
    const suspended = await changeStatus(created.id, 'SUSPENDED');
    expect(suspended.statusCode).toBe(200);

    const reactivated = await changeStatus(created.id, 'ACTIVE');
    expect(reactivated.statusCode).toBe(200);
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authorization(oldToken),
    });
    expect(oldSession.statusCode).toBe(401);
  });

  it('protege la propia cuenta y al último administrador activo', async () => {
    const selfSuspend = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${administratorId}/status`,
      headers: authorization(administratorToken),
      payload: { status: 'SUSPENDED' },
    });
    expect(selfSuspend.statusCode).toBe(403);

    const lastAdmin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${administratorId}/status`,
      headers: authorization(operatorToken),
      payload: { status: 'SUSPENDED' },
    });
    expect(lastAdmin.statusCode).toBe(409);
  });

  it('expone la auditoría solo con audit.read tenant-wide', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit?action=admin.user&pageSize=100',
      headers: authorization(administratorToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: Array<{ action: string; user: { id: string } | null }>;
    }>();
    expect(body.items.length).toBeGreaterThan(0);
    expect(
      body.items.every((item) => item.action.startsWith('admin.user')),
    ).toBe(true);
    expect(body.items.some((item) => item.user?.id === administratorId)).toBe(
      true,
    );

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit',
      headers: authorization(operatorToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.session.deleteMany({ where: { tenantId } });
      await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.role.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    if (foreignTenantId) {
      await prisma.session.deleteMany({ where: { tenantId: foreignTenantId } });
      await prisma.user.deleteMany({ where: { tenantId: foreignTenantId } });
      await prisma.tenant.delete({ where: { id: foreignTenantId } });
    }
    await app?.close();
  }, 60_000);

  async function prepareFixture() {
    tenantCode = `admin-e2e-${suffix}`;
    const tenant = await prisma.tenant.create({
      data: { code: tenantCode, name: `Administración E2E ${suffix}` },
    });
    tenantId = tenant.id;
    const foreignTenant = await prisma.tenant.create({
      data: {
        code: `admin-foreign-${suffix}`,
        name: `Administración extranjera E2E ${suffix}`,
      },
    });
    foreignTenantId = foreignTenant.id;
    const foreignUser = await identity.createUser({
      tenantId: foreignTenantId,
      dni: '31999999',
      displayName: 'Usuario de otra organización',
      password,
    });
    foreignUserId = foreignUser.id;
    const client = await prisma.client.create({
      data: {
        tenantId,
        slug: `client-${suffix}`,
        name: 'Cliente E2E',
        workspaces: { create: { moduleCode: 'automation.notes' } },
      },
    });
    clientId = client.id;

    for (const [code, description] of [
      ['users.manage', 'Administrar usuarios'],
      ['roles.manage', 'Administrar roles'],
      ['audit.read', 'Leer auditoría'],
      ['clients.read', 'Leer clientes'],
      ['titles.read', 'Leer títulos'],
      ['notes.read', 'Leer notas'],
      ['notes.create', 'Crear notas'],
      ['notes.edit', 'Editar notas'],
    ]) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description },
      });
    }

    const administratorRole = await createRole('admin', [
      'users.manage',
      'roles.manage',
      'audit.read',
    ]);
    const operatorRole = await createRole('operator', ['users.manage']);
    const editorRole = await createRole('editor', ['titles.read']);
    const dangerousRole = await createRole('dangerous-client', [
      'users.manage',
    ]);
    editorRoleId = editorRole.id;
    dangerousRoleId = dangerousRole.id;
    await createExactRole('automation.titles.reader', [
      'clients.read',
      'titles.read',
    ]);
    await createExactRole('automation.titles', ['clients.read', 'titles.read']);
    await createExactRole('automation.notes.reader', [
      'clients.read',
      'notes.read',
    ]);
    await createExactRole('automation.notes', [
      'clients.read',
      'notes.read',
      'notes.create',
      'notes.edit',
    ]);

    const administrator = await identity.createUser({
      tenantId,
      dni: '31000001',
      displayName: 'Administrador E2E',
      password,
    });
    administratorId = administrator.id;
    const operator = await identity.createUser({
      tenantId,
      dni: '31000002',
      displayName: 'Operador E2E',
      password,
    });
    operatorId = operator.id;
    await prisma.userRole.createMany({
      data: [
        { userId: administratorId, roleId: administratorRole.id },
        { userId: operatorId, roleId: operatorRole.id },
      ],
    });
    administratorToken = await login('31000001');
    operatorToken = await login('31000002');
  }

  async function createRole(code: string, permissions: string[]) {
    return prisma.role.create({
      data: {
        tenantId,
        code: `${code}-${suffix}`,
        name: `${code} E2E`,
        rolePermissions: {
          create: permissions.map((permission) => ({
            permission: { connect: { code: permission } },
          })),
        },
      },
    });
  }

  async function createExactRole(code: string, permissions: string[]) {
    return prisma.role.create({
      data: {
        tenantId,
        code,
        name: `${code} E2E`,
        isSystem: true,
        rolePermissions: {
          create: permissions.map((permission) => ({
            permission: { connect: { code: permission } },
          })),
        },
      },
    });
  }

  async function login(dni: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: nextLoginAddress(),
      payload: { tenantCode, dni, password },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ accessToken: string }>().accessToken;
  }

  function nextLoginAddress() {
    loginSequence += 1;
    return `10.20.0.${loginSequence}`;
  }

  async function createManagedUser(dni: string, displayName: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: authorization(administratorToken),
      payload: { dni, displayName, password },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  function changeStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${id}/status`,
      headers: authorization(administratorToken),
      payload: { status },
    });
  }

  function authorization(token: string) {
    return { authorization: `Bearer ${token}` };
  }
});
