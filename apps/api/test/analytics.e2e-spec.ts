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

describe('I HERE portal de resultados (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let token: string;
  let tenantId: string;
  let clientId: string;
  let foreignClientId: string;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const tenantCode = `analytics-${suffix}`;

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
    await prepareFixture(app.get(IdentityService));
  });

  afterAll(async () => {
    await app.close();
  });

  it('expone el callback OAuth configurado y conserva la ruta anterior', async () => {
    for (const path of [
      '/api/v1/analytics/oauth/google/callback',
      '/api/v1/analytics/google/oauth/callback',
    ]) {
      const response = await app.inject({ method: 'GET', url: path });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ statusCode: 400 });
    }
  });

  it('acepta los parámetros adicionales documentados que devuelve Google', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/oauth/google/callback?state=estado-google-valido-1234567890&code=codigo-google-valido&iss=https%3A%2F%2Faccounts.google.com&scope=email%20openid&authuser=0&hd=gruposp.pe&prompt=consent',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'La autorización de Google expiró o ya fue utilizada.',
    });
  });

  it('impide consultar otro cliente con permisos concedidos solo al primero', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/summary?clientId=${foreignClientId}`,
      headers: authorization(),
    });
    expect(response.statusCode).toBe(403);
  });

  it('compara periodos sin sumar dos veces las filas por página', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/summary?clientId=${clientId}&days=28`,
      headers: authorization(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: true,
      metrics: {
        sessions: { current: 120, previous: 60, changePercent: 100 },
        activeUsers: { current: 90 },
        clicks: { current: 40, previous: 20, changePercent: 100 },
      },
      topPages: [{ pagePath: '/blog/empleo', sessions: 80 }],
      topQueries: [{ query: 'empleos peru', clicks: 25 }],
    });
    expect(response.body).toContain('no atribuyen causalidad');
  });

  it('refleja la conexión analítica real en el inicio', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: authorization(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analytics: {
        status: 'CONNECTED',
        provider: 'Google Analytics 4 + Search Console',
      },
    });
  });

  it('impide compartir un informe antes de completar la primera sincronización', async () => {
    await prisma.analyticsConnection.update({
      where: { tenantId_clientId: { tenantId, clientId } },
      data: { lastSyncCompletedAt: null },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/results-links',
      headers: authorization(),
      payload: {
        clientId,
        recipientName: 'Equipo cliente',
        recipientEmail: 'cliente@example.com',
        expiresInDays: 7,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message:
        'Conecta, configura y sincroniza Google antes de crear un informe para el cliente.',
    });
    await prisma.analyticsConnection.update({
      where: { tenantId_clientId: { tenantId, clientId } },
      data: { lastSyncCompletedAt: new Date() },
    });
  });

  it('crea un enlace con token en fragmento y expone solo la vista pública', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/results-links',
      headers: authorization(),
      payload: {
        clientId,
        recipientName: 'Equipo cliente',
        recipientEmail: 'cliente@example.com',
        expiresInDays: 7,
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<{ url: string; id: string }>();
    const resultUrl = new URL(body.url);
    expect(resultUrl.search).toBe('');
    expect(resultUrl.hash.length).toBeGreaterThan(40);
    expect(JSON.stringify(body)).not.toContain('tokenHash');

    const publicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/results/current',
      headers: {
        'x-results-token': decodeURIComponent(resultUrl.hash.slice(1)),
      },
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json()).toMatchObject({
      client: { name: 'Cliente analítico' },
      recipientName: 'Equipo cliente',
      summary: { metrics: { sessions: { current: 120 } } },
    });
    expect(publicView.body).not.toContain('cliente@example.com');

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/public/results/current',
    });
    expect(missing.statusCode).toBe(404);

    const revoked = await app.inject({
      method: 'PATCH',
      url: `/api/v1/results-links/${body.id}/revoke`,
      headers: authorization(),
    });
    expect(revoked.statusCode).toBe(200);
    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/v1/public/results/current',
      headers: {
        'x-results-token': decodeURIComponent(resultUrl.hash.slice(1)),
      },
    });
    expect(afterRevoke.statusCode).toBe(404);
  });

  async function prepareFixture(identity: IdentityService) {
    const tenant = await prisma.tenant.create({
      data: { code: tenantCode, name: 'Tenant analítico E2E' },
    });
    tenantId = tenant.id;
    const [client, foreignClient] = await Promise.all([
      prisma.client.create({
        data: {
          tenantId,
          slug: `analytics-${suffix}`,
          name: 'Cliente analítico',
          workspaces: { create: { moduleCode: 'automation.notes' } },
        },
      }),
      prisma.client.create({
        data: {
          tenantId,
          slug: `foreign-${suffix}`,
          name: 'Cliente sin permiso',
          workspaces: { create: { moduleCode: 'automation.notes' } },
        },
      }),
    ]);
    clientId = client.id;
    foreignClientId = foreignClient.id;
    for (const [code, description] of [
      ['analytics.read', 'Leer analítica'],
      ['results_links.manage', 'Administrar enlaces'],
    ] as const) {
      await prisma.permission.upsert({
        where: { code },
        create: { code, description },
        update: {},
      });
    }
    const role = await prisma.role.create({
      data: {
        tenantId,
        code: `analytics-reader-${suffix}`,
        name: 'Analítica E2E',
        rolePermissions: {
          create: ['analytics.read', 'results_links.manage'].map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    const user = await identity.createUser({
      tenantId,
      dni: '42000001',
      displayName: 'Analista E2E',
      password: 'Analytics-e2e-2026!',
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, clientId },
    });
    const connection = await prisma.analyticsConnection.create({
      data: {
        tenantId,
        clientId,
        createdById: user.id,
        encryptedRefreshToken: 'not-used-in-this-test',
        scopes: [],
        ga4PropertyId: '12345678',
        gscSiteUrl: 'sc-domain:example.com',
        lastSyncCompletedAt: new Date(),
      },
    });
    const yesterday = utcOffset(-1);
    const previous = utcOffset(-29);
    await prisma.ga4PageMetric.createMany({
      data: [
        ga4(connection.id, yesterday, '__IHERE_TOTAL__', 120, 90, 200),
        ga4(connection.id, yesterday, '/blog/empleo', 80, 70, 130),
        ga4(connection.id, previous, '__IHERE_TOTAL__', 60, 50, 100),
      ],
    });
    await prisma.gscSearchMetric.createMany({
      data: [
        gsc(
          connection.id,
          yesterday,
          '__IHERE_TOTAL__',
          '__IHERE_TOTAL__',
          40,
          400,
        ),
        gsc(connection.id, yesterday, '/blog/empleo', 'empleos peru', 25, 250),
        gsc(
          connection.id,
          previous,
          '__IHERE_TOTAL__',
          '__IHERE_TOTAL__',
          20,
          250,
        ),
      ],
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        tenantCode,
        dni: '42000001',
        password: 'Analytics-e2e-2026!',
      },
    });
    expect(login.statusCode).toBe(201);
    token = login.json<{ accessToken: string }>().accessToken;
  }

  function ga4(
    connectionId: string,
    date: Date,
    pagePath: string,
    sessions: number,
    activeUsers: number,
    views: number,
  ) {
    return {
      connectionId,
      tenantId,
      clientId,
      date,
      pagePath,
      sessions,
      activeUsers,
      views,
      engagedSessions: Math.floor(sessions / 2),
      keyEvents: sessions / 10,
    };
  }

  function gsc(
    connectionId: string,
    date: Date,
    page: string,
    query: string,
    clicks: number,
    impressions: number,
  ) {
    return {
      connectionId,
      tenantId,
      clientId,
      date,
      page,
      query,
      clicks,
      impressions,
      ctr: clicks / impressions,
      position: 4,
    };
  }

  function utcOffset(days: number) {
    const now = new Date();
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return new Date(today + days * 86_400_000);
  }

  function authorization() {
    return { authorization: `Bearer ${token}` };
  }
});
