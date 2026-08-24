import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { IdentityService } from '../src/identity/identity.service';

jest.setTimeout(60_000);

describe('I HERE clientes editoriales (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const password = 'Clientes-e2e-2026!';
  const tenantCode = `clients-e2e-${suffix}`;
  let tenantId: string;
  let managerToken: string;
  let viewerToken: string;
  let administratorToken: string;

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
    const identity = app.get(IdentityService);

    const tenant = await prisma.tenant.create({
      data: { code: tenantCode, name: `Clientes E2E ${suffix}` },
    });
    tenantId = tenant.id;
    for (const [code, description] of [
      ['clients.read', 'Leer clientes'],
      ['clients.manage', 'Administrar clientes'],
      ['clients.delete', 'Eliminar clientes'],
    ]) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description },
      });
    }
    const managerRole = await createRole('manager', [
      'clients.read',
      'clients.manage',
    ]);
    const viewerRole = await createRole('viewer', ['clients.read']);
    const administratorRole = await createRole('administrator', [
      'clients.read',
      'clients.manage',
      'clients.delete',
    ]);
    const manager = await identity.createUser({
      tenantId,
      dni: '32000001',
      displayName: 'Gestora de clientes',
      password,
    });
    const viewer = await identity.createUser({
      tenantId,
      dni: '32000002',
      displayName: 'Lector de clientes',
      password,
    });
    const administrator = await identity.createUser({
      tenantId,
      dni: '32000003',
      displayName: 'Administradora de clientes',
      password,
    });
    await prisma.userRole.createMany({
      data: [
        { userId: manager.id, roleId: managerRole.id },
        { userId: viewer.id, roleId: viewerRole.id },
        { userId: administrator.id, roleId: administratorRole.id },
      ],
    });
    managerToken = await login('32000001');
    viewerToken = await login('32000002');
    administratorToken = await login('32000003');
  }, 60_000);

  it('crea, lista y desactiva un cliente sin borrar su expediente', async () => {
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: authorization(viewerToken),
      payload: { name: 'Cliente sin permiso' },
    });
    expect(forbidden.statusCode).toBe(403);

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: authorization(managerToken),
      payload: { name: '  Cliente   Editorial  ' },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<{
      id: string;
      name: string;
      slug: string;
      active: boolean;
    }>();
    expect(created).toMatchObject({
      name: 'Cliente Editorial',
      slug: 'cliente-editorial',
      active: true,
    });
    await expect(
      prisma.clientWorkspace.findUnique({
        where: {
          clientId_moduleCode: {
            clientId: created.id,
            moduleCode: 'automation.notes',
          },
        },
      }),
    ).resolves.toMatchObject({ active: true });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/clients',
      headers: authorization(viewerToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<Array<{ id: string }>>()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const deactivated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${created.id}`,
      headers: authorization(managerToken),
      payload: { active: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toMatchObject({ id: created.id, active: false });

    const viewerList = await app.inject({
      method: 'GET',
      url: '/api/v1/clients',
      headers: authorization(viewerToken),
    });
    expect(viewerList.json<Array<{ id: string }>>()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    await expect(
      prisma.auditLog.count({
        where: { tenantId, clientId: created.id, entityType: 'Client' },
      }),
    ).resolves.toBe(2);

    const managerCannotDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/clients/${created.id}`,
      headers: authorization(managerToken),
    });
    expect(managerCannotDelete.statusCode).toBe(403);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/clients/${created.id}`,
      headers: authorization(administratorToken),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ success: true });
    await expect(
      prisma.client.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: {
          tenantId,
          entityId: created.id,
          action: 'automation.client.deleted',
        },
      }),
    ).resolves.toBe(1);
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
    await app?.close();
  }, 60_000);

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

  async function login(dni: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantCode, dni, password },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ accessToken: string }>().accessToken;
  }

  function authorization(token: string) {
    return { authorization: `Bearer ${token}` };
  }
});
