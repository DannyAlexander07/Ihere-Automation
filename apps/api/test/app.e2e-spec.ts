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
import { TitleEvaluationProcessorService } from '../src/titles/title-evaluation-processor.service';
import { NoteQaProcessorService } from '../src/notes/note-qa-processor.service';
import { ExportProcessorService } from '../src/notes/export-processor.service';

jest.setTimeout(20_000);

describe('I HERE API (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let identity: IdentityService;
  let titleProcessor: TitleEvaluationProcessorService;
  let noteQaProcessor: NoteQaProcessorService;
  let exportProcessor: ExportProcessorService;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const tenantIds: string[] = [];
  const credentials = {
    dni: '10000001',
    password: 'E2e-password-2026!',
  };
  let tenantCodeA: string;
  let clientAId: string;
  let clientBId: string;
  let titleBId: string;
  let noteBId: string;
  let userAId: string;
  let primaryToken: string;
  let primaryUser: { permissions: string[]; clientIds: string[] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    await app.register(cookie);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, reply, done) => {
        const provided = request.headers['x-request-id'];
        const requestId =
          typeof provided === 'string' &&
          /^[a-zA-Z0-9._-]{8,100}$/.test(provided)
            ? provided
            : randomUUID();
        request.ihereRequestId = requestId;
        reply.header('x-request-id', requestId);
        done();
      });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    identity = app.get(IdentityService);
    titleProcessor = app.get(TitleEvaluationProcessorService);
    noteQaProcessor = app.get(NoteQaProcessorService);
    exportProcessor = app.get(ExportProcessorService);
    await prepareTenantIsolationFixture();
    const primaryLogin = await loginAsPrimaryUser();
    expect(primaryLogin.statusCode).toBe(201);
    const primaryBody = primaryLogin.json<{
      accessToken: string;
      user: { permissions: string[]; clientIds: string[] };
    }>();
    primaryToken = primaryBody.accessToken;
    primaryUser = primaryBody.user;
  }, 30_000);

  it('expone salud pública con base conectada', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      database: 'connected',
    });
  });

  it('protege los clientes sin token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/clients',
    });
    expect(response.statusCode).toBe(401);
  });

  it('aísla clientes, títulos y notas de otra organización', async () => {
    const clients = await app.inject({
      method: 'GET',
      url: '/api/v1/clients',
      headers: authHeaders(),
    });
    expect(clients.statusCode).toBe(200);
    expect(
      clients.json<Array<{ id: string }>>().map((item) => item.id),
    ).toEqual([clientAId]);

    const foreignClient = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${clientBId}`,
      headers: authHeaders(),
    });
    expect(foreignClient.statusCode).toBe(404);

    const foreignTitles = await app.inject({
      method: 'GET',
      url: `/api/v1/titles?clientId=${clientBId}`,
      headers: authHeaders(),
    });
    expect(foreignTitles.statusCode).toBe(200);
    expect(foreignTitles.json()).toEqual([]);

    const foreignTitle = await app.inject({
      method: 'GET',
      url: `/api/v1/titles/${titleBId}`,
      headers: authHeaders(),
    });
    expect(foreignTitle.statusCode).toBe(404);

    const foreignNote = await app.inject({
      method: 'GET',
      url: `/api/v1/notes/${noteBId}`,
      headers: authHeaders(),
    });
    expect(foreignNote.statusCode).toBe(404);

    expect(primaryUser.permissions).not.toContain('roles.manage');
    expect(primaryUser.permissions).not.toContain('users.manage');
    expect(primaryUser.clientIds).toEqual([]);
  });

  it('calcula el panel solo con datos visibles de la organización autenticada', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      metrics: {
        titlesToReview: 0,
        notesInProgress: 0,
        qualityAlerts: 0,
        approvalsPending: 0,
      },
      workflow: { active: 0 },
      activity: [],
      analytics: { status: 'NOT_CONFIGURED' },
    });
  });

  it('separa la actividad visible cuando los permisos de títulos y notas tienen alcances distintos', async () => {
    const scopedClient = await prisma.client.create({
      data: {
        tenantId: tenantIds[0],
        slug: `mixed-scope-${suffix}`,
        name: 'Cliente con alcance mixto',
        workspaces: { create: { moduleCode: 'automation.notes' } },
      },
    });
    const mixedUser = await identity.createUser({
      tenantId: tenantIds[0],
      dni: '10000003',
      password: credentials.password,
      displayName: 'Usuario alcance mixto',
    });
    const mixedPermissionCodes = [
      'titles.read',
      'titles.create',
      'notes.read',
      'notes.export',
      'clients.read',
      'ai.generate',
      'ai.read',
    ];
    for (const code of mixedPermissionCodes) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: `Permiso E2E ${code}` },
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: mixedPermissionCodes } },
      select: { id: true, code: true },
    });
    const permissionId = (code: string) =>
      permissions.find((permission) => permission.code === code)!.id;
    const [globalTitleRole, scopedNoteRole, otherClientRole] =
      await Promise.all([
        prisma.role.create({
          data: {
            tenantId: tenantIds[0],
            code: `mixed-titles-${suffix}`,
            name: 'Títulos globales E2E',
            rolePermissions: {
              create: { permissionId: permissionId('titles.read') },
            },
          },
        }),
        prisma.role.create({
          data: {
            tenantId: tenantIds[0],
            code: `mixed-notes-${suffix}`,
            name: 'Notas por cliente E2E',
            rolePermissions: {
              create: [
                'notes.read',
                'notes.export',
                'clients.read',
                'titles.create',
              ].map((code) => ({ permissionId: permissionId(code) })),
            },
          },
        }),
        prisma.role.create({
          data: {
            tenantId: tenantIds[0],
            code: `mixed-other-${suffix}`,
            name: 'Otro cliente E2E',
            rolePermissions: {
              create: ['titles.read', 'ai.generate', 'ai.read'].map((code) => ({
                permissionId: permissionId(code),
              })),
            },
          },
        }),
      ]);
    await prisma.userRole.createMany({
      data: [
        { userId: mixedUser.id, roleId: globalTitleRole.id },
        {
          userId: mixedUser.id,
          roleId: scopedNoteRole.id,
          clientId: clientAId,
        },
        {
          userId: mixedUser.id,
          roleId: otherClientRole.id,
          clientId: scopedClient.id,
        },
      ],
    });

    const forbiddenTitle = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: scopedClient.id,
        title: 'Título de cliente sin permiso de notas',
        canonicalTitle: 'titulo de cliente sin permiso de notas',
        objective: 'Probar el alcance de listados.',
        audience: 'QA',
        searchIntent: 'Validación',
        focus: 'Autorización por cliente',
        createdById: mixedUser.id,
      },
    });
    const forbiddenNote = await prisma.noteDocument.create({
      data: {
        tenantId: tenantIds[0],
        clientId: scopedClient.id,
        titleProposalId: forbiddenTitle.id,
        briefSnapshot: { title: forbiddenTitle.title },
        createdById: mixedUser.id,
        versions: {
          create: {
            version: 1,
            title: forbiddenTitle.title,
            content: { schemaVersion: 1, blocks: [] },
            contentHash: '1'.repeat(64),
            source: 'SYSTEM',
            createdById: mixedUser.id,
          },
        },
      },
    });
    const forbiddenExport = await prisma.exportArtifact.create({
      data: {
        noteId: forbiddenNote.id,
        version: 1,
        format: 'PDF',
        status: 'READY',
        fileName: 'privado.pdf',
        createdById: mixedUser.id,
      },
    });
    const forbiddenAiRun = await prisma.aiGenerationRun.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        kind: 'TITLE_PROPOSALS',
        status: 'COMPLETED',
        requestedById: mixedUser.id,
        provider: 'openai',
        model: 'gpt-5.6-terra',
        reasoningEffort: 'medium',
        inputSnapshot: {},
        output: {},
        budgetLimitMicros: 100_000n,
        pricingVersion: 'e2e',
        completedAt: new Date(),
      },
    });

    const allowedTitleEntity = `allowed-title-${suffix}`;
    const allowedNoteEntity = `allowed-note-${suffix}`;
    const forbiddenNoteEntity = `forbidden-note-${suffix}`;
    await prisma.auditLog.createMany({
      data: [
        {
          tenantId: tenantIds[0],
          clientId: scopedClient.id,
          userId: mixedUser.id,
          actorType: 'USER',
          action: 'title.created',
          entityType: 'TitleProposal',
          entityId: allowedTitleEntity,
        },
        {
          tenantId: tenantIds[0],
          clientId: clientAId,
          userId: mixedUser.id,
          actorType: 'USER',
          action: 'note.version.created',
          entityType: 'NoteDocument',
          entityId: allowedNoteEntity,
        },
        {
          tenantId: tenantIds[0],
          clientId: scopedClient.id,
          userId: mixedUser.id,
          actorType: 'USER',
          action: 'note.version.created',
          entityType: 'NoteDocument',
          entityId: forbiddenNoteEntity,
        },
      ],
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        tenantCode: tenantCodeA,
        dni: '10000003',
        password: credentials.password,
      },
    });
    expect(login.statusCode).toBe(201);
    const token = login.json<{ accessToken: string }>().accessToken;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const entityIds = response
      .json<{ activity: Array<{ entityId: string | null }> }>()
      .activity.map((entry) => entry.entityId);
    expect(entityIds).toEqual(
      expect.arrayContaining([allowedTitleEntity, allowedNoteEntity]),
    );
    expect(entityIds).not.toContain(forbiddenNoteEntity);

    const [clients, notes, exports, aiRead, aiGenerate] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/clients',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/notes',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/exports',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/ai/generations/${forbiddenAiRun.id}`,
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/ai/generations/titles',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          clientId: clientAId,
          topic: 'Tema de prueba de permisos',
          objective: 'No debe ejecutar IA con permisos cruzados.',
          audience: 'Equipo QA',
          searchIntent: 'Validación',
          campaignYear: 2026,
          campaignMonth: 8,
        },
      }),
    ]);
    expect(clients.statusCode).toBe(200);
    expect(
      clients.json<Array<{ id: string }>>().map((item) => item.id),
    ).toEqual([clientAId]);
    expect(notes.statusCode).toBe(200);
    expect(
      notes.json<Array<{ id: string }>>().map((item) => item.id),
    ).not.toContain(forbiddenNote.id);
    expect(exports.statusCode).toBe(200);
    expect(
      exports.json<Array<{ id: string }>>().map((item) => item.id),
    ).not.toContain(forbiddenExport.id);
    expect(aiRead.statusCode).toBe(403);
    expect(aiGenerate.statusCode).toBe(403);
  });

  it('la base de datos rechaza un título que intente cruzar organizaciones', async () => {
    await expect(
      prisma.titleProposal.create({
        data: {
          tenantId: tenantIds[0],
          clientId: clientBId,
          title: 'Relación multiempresa inválida para prueba',
          canonicalTitle: 'relacion multiempresa invalida para prueba',
          objective: 'Demostrar la restricción de integridad en PostgreSQL.',
          audience: 'Equipo técnico',
          searchIntent: 'Validación de seguridad',
          focus: 'Aislamiento entre organizaciones',
          createdById: userAId,
        },
      }),
    ).rejects.toThrow(/tenant mismatch for title client/);
  });

  it('evita dos evaluaciones simultáneas para la misma versión', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/titles',
      headers: authHeaders(),
      payload: {
        clientId: clientAId,
        title: 'Cómo validar procesos editoriales sin perder trazabilidad',
        objective: 'Comprobar la exclusión mutua al solicitar evaluaciones.',
        audience: 'Equipo editorial',
        searchIntent: 'Aprender a validar procesos',
        focus: 'Concurrencia e idempotencia editorial',
      },
    });
    expect(created.statusCode).toBe(201);
    const title = created.json<{ id: string; currentVersion: number }>();
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/titles/${title.id}/submit`,
      headers: authHeaders(),
      payload: { expectedVersion: title.currentVersion },
    });
    expect(submitted.statusCode).toBe(201);

    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/titles/${title.id}/evaluations`,
          headers: authHeaders(),
          payload: { expectedVersion: title.currentVersion },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.titleEvaluation.count({ where: { proposalId: title.id } }),
    ).toBe(1);
    const acceptedEvaluation = responses
      .find((response) => response.statusCode === 201)!
      .json<{ id: string }>();
    const processorResults = await Promise.all([
      titleProcessor.process(acceptedEvaluation.id, Date.now() + 10_000),
      titleProcessor.process(acceptedEvaluation.id, Date.now() + 10_000),
    ]);
    expect(
      processorResults.filter((result) => result.status === 'COMPLETED'),
    ).toHaveLength(1);
    expect(
      processorResults.some((result) =>
        ['already-running', 'already-completed'].includes(result.status),
      ),
    ).toBe(true);
  });

  it('guarda la corrección y encola su evaluación en una sola operación', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/titles',
      headers: authHeaders(),
      payload: {
        clientId: clientAId,
        title: 'Cómo ordenar un proceso editorial con trazabilidad completa',
        objective: 'Validar una revisión atómica antes de la evaluación.',
        audience: 'Equipo editorial',
        searchIntent: 'Aprender a ordenar procesos',
        focus: 'Consistencia entre edición y evaluación',
      },
    });
    expect(created.statusCode).toBe(201);
    const title = created.json<{ id: string; currentVersion: number }>();

    const revised = await app.inject({
      method: 'POST',
      url: `/api/v1/titles/${title.id}/revisions/evaluate`,
      headers: authHeaders(),
      payload: {
        expectedVersion: title.currentVersion,
        title:
          'Cómo organizar un proceso editorial con trazabilidad verificable',
        reason:
          'Se precisa el beneficio y se elimina una formulación demasiado genérica.',
        correctionType: 'STYLE',
      },
    });

    expect(revised.statusCode).toBe(201);
    expect(revised.json()).toMatchObject({
      currentVersion: 2,
      status: 'EVALUATING',
    });
    expect(
      await prisma.titleVersion.count({ where: { proposalId: title.id } }),
    ).toBe(2);
    expect(
      await prisma.titleEvaluation.count({
        where: { proposalId: title.id, version: 2 },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxJob.count({
        where: { aggregateType: 'title_evaluation' },
      }),
    ).toBeGreaterThan(0);
  });

  it('convierte una duplicidad descartada en rechazo terminal', async () => {
    const proposal = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Propuesta duplicada que debe descartarse',
        canonicalTitle: 'propuesta duplicada que debe descartarse',
        objective: 'Validar la semántica terminal de descartar.',
        audience: 'Equipo editorial',
        searchIntent: 'Validación técnica',
        focus: 'Duplicidad',
        status: 'PROPOSED',
        duplicateScore: 91,
        duplicateResolution: 'PENDING',
        createdById: userAId,
        evaluations: {
          create: {
            version: 1,
            status: 'COMPLETED',
            verdict: 'PASS',
            overallScore: 95,
            requestedById: userAId,
            completedAt: new Date(),
          },
        },
      },
    });
    const discarded = await app.inject({
      method: 'POST',
      url: `/api/v1/titles/${proposal.id}/decisions`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 1,
        type: 'RESOLVE_DUPLICATE',
        duplicateResolution: 'DISCARD',
        reason: 'La propuesta repite un contenido existente y se descarta.',
      },
    });
    expect(discarded.statusCode).toBe(201);
    expect(discarded.json()).toMatchObject({
      proposal: { status: 'REJECTED', duplicateResolution: 'DISCARD' },
    });
    const approval = await app.inject({
      method: 'POST',
      url: `/api/v1/titles/${proposal.id}/decisions`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 1,
        type: 'APPROVE',
        reason: 'No debería poder aprobarse después de descartar.',
      },
    });
    expect(approval.statusCode).toBe(409);
  });

  it('impide decisiones contradictorias concurrentes', async () => {
    const proposal = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Título listo para una decisión editorial concurrente',
        canonicalTitle: 'titulo listo para una decision editorial concurrente',
        objective: 'Verificar que solo una decisión humana pueda prevalecer.',
        audience: 'Equipo editorial',
        searchIntent: 'Validación técnica',
        focus: 'Control optimista de decisiones',
        status: 'PROPOSED',
        duplicateResolution: 'UNIQUE',
        createdById: userAId,
        evaluations: {
          create: {
            version: 1,
            status: 'COMPLETED',
            verdict: 'PASS',
            overallScore: 100,
            requestedById: userAId,
            completedAt: new Date(),
          },
        },
      },
    });

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/titles/${proposal.id}/decisions`,
        headers: authHeaders(),
        payload: {
          expectedVersion: 1,
          type: 'APPROVE',
          reason: 'Aprobación concurrente de prueba con sustento suficiente.',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/titles/${proposal.id}/decisions`,
        headers: authHeaders(),
        payload: {
          expectedVersion: 1,
          type: 'REJECT',
          reason: 'Rechazo concurrente de prueba con sustento suficiente.',
        },
      }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.titleDecision.count({ where: { proposalId: proposal.id } }),
    ).toBe(1);
  });

  it('evita que dos ediciones sobrescriban la misma versión de nota', async () => {
    const title = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Nota aprobada para validar versiones concurrentes',
        canonicalTitle: 'nota aprobada para validar versiones concurrentes',
        objective: 'Verificar el versionado optimista de las notas.',
        audience: 'Equipo editorial',
        searchIntent: 'Validación técnica',
        focus: 'Versiones de contenido',
        status: 'APPROVED',
        duplicateResolution: 'UNIQUE',
        createdById: userAId,
        approvedById: userAId,
        approvedAt: new Date(),
      },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: authHeaders(),
      payload: { titleProposalId: title.id },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json<{ id: string }>();

    const responses = await Promise.all(
      ['Primera versión concurrente.', 'Segunda versión concurrente.'].map(
        (text, index) =>
          app.inject({
            method: 'PATCH',
            url: `/api/v1/notes/${note.id}`,
            headers: authHeaders(),
            payload: {
              expectedVersion: 1,
              content: {
                schemaVersion: 1,
                blocks: [{ id: `p-${index}`, type: 'paragraph', text }],
              },
              correctionType: 'STYLE',
              reason: `Edición concurrente ${index + 1} para validar versión.`,
            },
          }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect(await prisma.noteVersion.count({ where: { noteId: note.id } })).toBe(
      2,
    );
  });

  it('reintenta un QA técnico fallido sin crear una evaluación duplicada', async () => {
    const title = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Nota para reintentar un QA interrumpido',
        canonicalTitle: 'nota para reintentar un qa interrumpido',
        objective: 'Validar recuperación del QA.',
        audience: 'Equipo editorial',
        searchIntent: 'Validación técnica',
        focus: 'Reintentos',
        status: 'APPROVED',
        duplicateResolution: 'UNIQUE',
        createdById: userAId,
        approvedById: userAId,
        approvedAt: new Date(),
      },
    });
    const note = await prisma.noteDocument.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        titleProposalId: title.id,
        status: 'CHANGES_REQUESTED',
        briefSnapshot: { title: title.title },
        createdById: userAId,
        versions: {
          create: {
            version: 1,
            title: title.title,
            content: {
              schemaVersion: 1,
              blocks: [
                {
                  id: 'p-retry',
                  type: 'paragraph',
                  text: 'Contenido suficiente para volver a ejecutar el control de calidad.',
                },
              ],
            },
            wordCount: 10,
            contentHash: '2'.repeat(64),
            source: 'SYSTEM',
            createdById: userAId,
          },
        },
      },
    });
    const evaluation = await prisma.noteQaEvaluation.create({
      data: {
        noteId: note.id,
        version: 1,
        status: 'FAILED',
        verdict: 'ERROR',
        overallScore: 0,
        summary: 'Interrupción técnica simulada.',
        requestedById: userAId,
        completedAt: new Date(),
      },
    });
    await prisma.outboxJob.create({
      data: {
        tenantId: tenantIds[0],
        jobType: 'evaluate-note',
        aggregateType: 'note_qa_evaluation',
        aggregateId: evaluation.id,
        payload: { evaluationId: evaluation.id },
        status: 'FAILED',
        attempts: 3,
        lastError: 'Interrupción simulada.',
      },
    });

    const retried = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/qa`,
      headers: authHeaders(),
      payload: { expectedVersion: 1 },
    });
    expect(retried.statusCode).toBe(201);
    expect(retried.json()).toMatchObject({
      id: evaluation.id,
      status: 'QUEUED',
    });
    expect(
      await prisma.noteQaEvaluation.count({
        where: { noteId: note.id, version: 1 },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxJob.findFirstOrThrow({
        where: {
          jobType: 'evaluate-note',
          aggregateType: 'note_qa_evaluation',
          aggregateId: evaluation.id,
        },
        select: { status: true, attempts: true, lastError: true },
      }),
    ).toEqual({ status: 'PENDING', attempts: 0, lastError: null });
  });

  it('agrupa una sesión de títulos y registra una decisión del cliente por cada propuesta', async () => {
    const run = await prisma.aiGenerationRun.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        kind: 'TITLE_PROPOSALS',
        status: 'COMPLETED',
        requestedById: userAId,
        provider: 'e2e',
        model: 'e2e-package',
        reasoningEffort: 'low',
        inputSnapshot: {
          request: {
            topic: 'Gestión estratégica del talento',
            objective: 'Orientar decisiones de Recursos Humanos',
            audience: 'Gerencias de Recursos Humanos',
            searchIntent: 'Resolver',
            count: 2,
            additionalContext: null,
          },
        },
        output: { candidates: 2 },
        budgetLimitMicros: 1_000_000,
        pricingVersion: 'e2e',
        completedAt: new Date(),
        titleProposals: {
          create: [
            {
              tenantId: tenantIds[0],
              clientId: clientAId,
              title: 'Cómo fortalecer la empleabilidad en un mercado cambiante',
              canonicalTitle:
                'como fortalecer la empleabilidad en un mercado cambiante',
              objective: 'Orientar una decisión informada de talento.',
              audience: 'Gerencias de Recursos Humanos',
              searchIntent: 'Resolver una necesidad de empleabilidad',
              focus: 'Empleabilidad sostenible',
              opportunity: 'Aportar conocimiento práctico de Adecco Perú',
              risk: 'Evitar afirmaciones sin respaldo',
              status: 'PROPOSED',
              duplicateResolution: 'UNIQUE',
              createdById: userAId,
              versions: {
                create: {
                  version: 1,
                  title:
                    'Cómo fortalecer la empleabilidad en un mercado cambiante',
                  objective: 'Orientar una decisión informada de talento.',
                  audience: 'Gerencias de Recursos Humanos',
                  searchIntent: 'Resolver una necesidad de empleabilidad',
                  focus: 'Empleabilidad sostenible',
                  opportunity: 'Aportar conocimiento práctico de Adecco Perú',
                  risk: 'Evitar afirmaciones sin respaldo',
                  source: 'AI_ASSISTED',
                  createdById: userAId,
                },
              },
              evaluations: {
                create: {
                  version: 1,
                  status: 'COMPLETED',
                  verdict: 'PASS',
                  overallScore: 92,
                  summary: 'Propuesta apta para revisión del cliente.',
                  requestedById: userAId,
                  completedAt: new Date(),
                },
              },
            },
            {
              tenantId: tenantIds[0],
              clientId: clientAId,
              title: 'Gestión del talento: decisiones para sostener el negocio',
              canonicalTitle:
                'gestion del talento decisiones para sostener el negocio',
              objective: 'Explicar criterios de priorización empresarial.',
              audience: 'Líderes empresariales',
              searchIntent: 'Aprender a priorizar decisiones de talento',
              focus: 'Continuidad del negocio',
              opportunity: 'Vincular experiencia autorizada de Adecco Perú',
              risk: 'Evitar generalidades',
              status: 'PROPOSED',
              duplicateResolution: 'UNIQUE',
              createdById: userAId,
              versions: {
                create: {
                  version: 1,
                  title:
                    'Gestión del talento: decisiones para sostener el negocio',
                  objective: 'Explicar criterios de priorización empresarial.',
                  audience: 'Líderes empresariales',
                  searchIntent: 'Aprender a priorizar decisiones de talento',
                  focus: 'Continuidad del negocio',
                  opportunity: 'Vincular experiencia autorizada de Adecco Perú',
                  risk: 'Evitar generalidades',
                  source: 'AI_ASSISTED',
                  createdById: userAId,
                },
              },
              evaluations: {
                create: {
                  version: 1,
                  status: 'COMPLETED',
                  verdict: 'PASS',
                  overallScore: 90,
                  summary: 'Propuesta apta para revisión del cliente.',
                  requestedById: userAId,
                  completedAt: new Date(),
                },
              },
            },
          ],
        },
      },
      include: { titleProposals: { orderBy: { createdAt: 'asc' } } },
    });

    const titleList = await app.inject({
      method: 'GET',
      url: `/api/v1/titles?clientId=${clientAId}`,
      headers: authHeaders(),
    });
    expect(titleList.statusCode).toBe(200);
    expect(
      titleList
        .json<Array<{ generationRunId: string | null }>>()
        .filter((title) => title.generationRunId === run.id),
    ).toHaveLength(2);

    const shared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/title-packages/${run.id}`,
      headers: authHeaders(),
      payload: {
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
      },
    });
    expect(shared.statusCode).toBe(201);
    const sharedBody = shared.json<{
      id: string;
      reviewUrl: string;
      titleCount: number;
    }>();
    expect(sharedBody.titleCount).toBe(2);
    expect(sharedBody.reviewUrl).toContain('/revision-paquete-titulos#');
    const token = new URL(sharedBody.reviewUrl).hash.slice(1);
    expect(token).toHaveLength(43);

    const dispatched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/review-links/title-packages/${sharedBody.id}/dispatch`,
      headers: authHeaders(),
      payload: {
        senderEmail: 'tecnologia@mood.pe',
        subject: 'Adecco Perú | Revisión de paquete de títulos',
        externalMessageId: `e2e-title-package-${suffix}`,
        confirmedSent: true,
      },
    });
    expect(dispatched.statusCode).toBe(200);
    expect(dispatched.json()).toMatchObject({
      sentByEmail: 'tecnologia@mood.pe',
      externalMessageId: `e2e-title-package-${suffix}`,
    });

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/review-links/title-packages/${run.id}`,
      headers: authHeaders(),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual([
      expect.objectContaining({
        id: sharedBody.id,
        status: 'ACTIVE',
        titleCount: 2,
        sentByEmail: 'tecnologia@mood.pe',
        reviewUrl: sharedBody.reviewUrl,
      }),
    ]);
    expect(JSON.stringify(history.json())).not.toContain('tokenHash');

    const recoveredAccess = await app.inject({
      method: 'PATCH',
      url: `/api/v1/review-links/title-packages/${sharedBody.id}/access`,
      headers: authHeaders(),
    });
    expect(recoveredAccess.statusCode).toBe(200);
    expect(recoveredAccess.json()).toMatchObject({
      id: sharedBody.id,
      reviewUrl: sharedBody.reviewUrl,
      status: 'ACTIVE',
    });

    const publicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/title-package-reviews/current',
      headers: { 'x-review-token': token },
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json()).toMatchObject({
      generationRunId: run.id,
      topic: 'Gestión estratégica del talento',
      recipientEmailHint: 'a***@cliente.pe',
      titles: [
        { proposalId: run.titleProposals[0].id, version: 1 },
        { proposalId: run.titleProposals[1].id, version: 1 },
      ],
    });

    const decided = await app.inject({
      method: 'POST',
      url: '/api/v1/public/title-package-reviews/current/decision',
      headers: { 'x-review-token': token },
      payload: {
        reviewerEmail: 'angie@cliente.pe',
        decisions: [
          {
            proposalId: run.titleProposals[0].id,
            version: 1,
            type: 'APPROVE',
            reason: 'Conforme para iniciar la redacción de esta nota.',
          },
          {
            proposalId: run.titleProposals[1].id,
            version: 1,
            type: 'REQUEST_CHANGES',
            reason: 'Ajustar el enfoque al contexto laboral peruano.',
          },
        ],
      },
    });
    expect(decided.statusCode).toBe(201);
    expect(decided.json()).toMatchObject({
      accepted: true,
      decisions: [
        { proposalId: run.titleProposals[0].id, status: 'APPROVED' },
        {
          proposalId: run.titleProposals[1].id,
          status: 'CHANGES_REQUESTED',
        },
      ],
    });
    expect(
      await prisma.titleProposal.findMany({
        where: { generationRunId: run.id },
        orderBy: { createdAt: 'asc' },
        select: { status: true },
      }),
    ).toEqual([{ status: 'APPROVED' }, { status: 'CHANGES_REQUESTED' }]);
    expect(
      await prisma.titlePackageReviewDecision.count({
        where: { item: { linkId: sharedBody.id } },
      }),
    ).toBe(2);
    expect(
      await prisma.titlePackageReviewLink.findUniqueOrThrow({
        where: { id: sharedBody.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'COMPLETED' });

    const correctedTitle =
      'Gestión del talento en Perú: decisiones para sostener el negocio';
    await prisma.$transaction(async (tx) => {
      await tx.titleVersion.create({
        data: {
          proposalId: run.titleProposals[1].id,
          version: 2,
          title: correctedTitle,
          objective: 'Explicar criterios de priorización empresarial en Perú.',
          audience: 'Líderes empresariales en Perú',
          searchIntent: 'Aprender a priorizar decisiones de talento en Perú',
          focus: 'Continuidad del negocio en el contexto laboral peruano',
          opportunity: 'Vincular experiencia autorizada de Adecco Perú',
          risk: 'Evitar generalidades y afirmaciones sin respaldo',
          source: 'AI_ASSISTED',
          createdById: userAId,
        },
      });
      await tx.titleEvaluation.create({
        data: {
          proposalId: run.titleProposals[1].id,
          version: 2,
          status: 'COMPLETED',
          verdict: 'PASS',
          overallScore: 93,
          summary: 'Corrección lista para reenviar al cliente.',
          requestedById: userAId,
          completedAt: new Date(),
        },
      });
      await tx.titleProposal.update({
        where: { id: run.titleProposals[1].id },
        data: {
          title: correctedTitle,
          canonicalTitle:
            'gestion del talento en peru decisiones para sostener el negocio',
          objective: 'Explicar criterios de priorización empresarial en Perú.',
          audience: 'Líderes empresariales en Perú',
          searchIntent: 'Aprender a priorizar decisiones de talento en Perú',
          focus: 'Continuidad del negocio en el contexto laboral peruano',
          opportunity: 'Vincular experiencia autorizada de Adecco Perú',
          risk: 'Evitar generalidades y afirmaciones sin respaldo',
          currentVersion: 2,
          status: 'PROPOSED',
        },
      });
    });

    const correctionShared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/title-packages/${run.id}`,
      headers: authHeaders(),
      payload: {
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
        proposalIds: [run.titleProposals[1].id],
      },
    });
    expect(correctionShared.statusCode).toBe(201);
    const correctionSharedBody = correctionShared.json<{
      reviewUrl: string;
      titleCount: number;
    }>();
    expect(correctionSharedBody.titleCount).toBe(1);
    const correctionToken = new URL(correctionSharedBody.reviewUrl).hash.slice(
      1,
    );

    const correctionPublicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/title-package-reviews/current',
      headers: { 'x-review-token': correctionToken },
    });
    expect(correctionPublicView.statusCode).toBe(200);
    expect(correctionPublicView.json()).toMatchObject({
      generationRunId: run.id,
      titles: [
        {
          proposalId: run.titleProposals[1].id,
          version: 2,
          content: { title: correctedTitle },
        },
      ],
    });

    const correctionDecided = await app.inject({
      method: 'POST',
      url: '/api/v1/public/title-package-reviews/current/decision',
      headers: { 'x-review-token': correctionToken },
      payload: {
        reviewerEmail: 'angie@cliente.pe',
        decisions: [
          {
            proposalId: run.titleProposals[1].id,
            version: 2,
            type: 'APPROVE',
          },
        ],
      },
    });
    expect(correctionDecided.statusCode).toBe(201);
    expect(
      await prisma.titleProposal.findMany({
        where: { generationRunId: run.id },
        orderBy: { createdAt: 'asc' },
        select: { status: true },
      }),
    ).toEqual([{ status: 'APPROVED' }, { status: 'APPROVED' }]);
  }, 25_000);

  it('cierra un paquete de cinco con cuatro aprobados y archiva el sobrante', async () => {
    const packageRun = await prisma.aiGenerationRun.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        kind: 'TITLE_PROPOSALS',
        status: 'COMPLETED',
        requestedById: userAId,
        provider: 'e2e',
        model: 'e2e-package-selection',
        reasoningEffort: 'low',
        inputSnapshot: {
          request: {
            topic: 'Selección mensual de contenidos',
            objective: 'Seleccionar cuatro notas para el mes',
            audience: 'Gerencias de Recursos Humanos',
            searchIntent: 'Resolver',
            count: 5,
          },
        },
        output: { candidates: 5 },
        budgetLimitMicros: 1_000_000,
        pricingVersion: 'e2e',
        completedAt: new Date(),
        titleProposals: {
          create: Array.from({ length: 5 }, (_, index) => {
            const position = index + 1;
            const title = `Alternativa mensual ${position}: gestión del talento`;
            return {
              tenantId: tenantIds[0],
              clientId: clientAId,
              title,
              canonicalTitle: `alternativa mensual ${position} gestion del talento`,
              objective: `Orientar la decisión editorial ${position}.`,
              audience: 'Gerencias de Recursos Humanos',
              searchIntent: 'Resolver una necesidad empresarial',
              focus: `Enfoque editorial verificable ${position}`,
              opportunity: 'Aportar conocimiento práctico de Adecco Perú',
              risk: 'Evitar afirmaciones sin respaldo',
              status: 'PROPOSED' as const,
              duplicateResolution: 'UNIQUE' as const,
              createdById: userAId,
              versions: {
                create: {
                  version: 1,
                  title,
                  objective: `Orientar la decisión editorial ${position}.`,
                  audience: 'Gerencias de Recursos Humanos',
                  searchIntent: 'Resolver una necesidad empresarial',
                  focus: `Enfoque editorial verificable ${position}`,
                  opportunity: 'Aportar conocimiento práctico de Adecco Perú',
                  risk: 'Evitar afirmaciones sin respaldo',
                  source: 'AI_ASSISTED' as const,
                  createdById: userAId,
                },
              },
              evaluations: {
                create: {
                  version: 1,
                  status: 'COMPLETED' as const,
                  verdict: 'PASS' as const,
                  overallScore: 90,
                  summary: 'Propuesta apta para revisión del cliente.',
                  requestedById: userAId,
                  completedAt: new Date(),
                },
              },
            };
          }),
        },
      },
      include: { titleProposals: { orderBy: { title: 'asc' } } },
    });

    const shared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/title-packages/${packageRun.id}`,
      headers: authHeaders(),
      payload: {
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
      },
    });
    expect(shared.statusCode).toBe(201);
    expect(shared.json()).toMatchObject({ titleCount: 5, approvalTarget: 4 });
    const token = new URL(
      shared.json<{ reviewUrl: string }>().reviewUrl,
    ).hash.slice(1);

    const publicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/title-package-reviews/current',
      headers: { 'x-review-token': token },
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json()).toMatchObject({ approvalTarget: 4 });

    const decided = await app.inject({
      method: 'POST',
      url: '/api/v1/public/title-package-reviews/current/decision',
      headers: { 'x-review-token': token },
      payload: {
        reviewerEmail: 'angie@cliente.pe',
        decisions: packageRun.titleProposals.slice(0, 4).map((proposal) => ({
          proposalId: proposal.id,
          version: 1,
          type: 'APPROVE',
        })),
      },
    });
    expect(decided.statusCode).toBe(201);
    expect(decided.json()).toMatchObject({
      accepted: true,
      approvalTarget: 4,
      notSelectedCount: 1,
    });
    expect(
      await prisma.titleProposal.groupBy({
        by: ['status'],
        where: { generationRunId: packageRun.id },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ).toEqual([
      { _count: { _all: 4 }, status: 'APPROVED' },
      { _count: { _all: 1 }, status: 'ARCHIVED' },
    ]);
    expect(
      await prisma.titlePackageReviewDecision.count({
        where: { item: { linkId: shared.json<{ id: string }>().id } },
      }),
    ).toBe(4);
  }, 25_000);

  it('comparte un paquete navegable de notas con propuesta visual y registra una decisión por nota', async () => {
    const packageRun = await prisma.aiGenerationRun.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        kind: 'TITLE_PROPOSALS',
        status: 'COMPLETED',
        requestedById: userAId,
        provider: 'e2e',
        model: 'e2e-note-package',
        reasoningEffort: 'low',
        inputSnapshot: {
          request: { topic: 'Paquete mensual de notas', count: 2 },
        },
        output: { candidates: 2 },
        budgetLimitMicros: 1_000_000,
        pricingVersion: 'e2e',
        completedAt: new Date(),
        titleProposals: {
          create: Array.from({ length: 2 }, (_, index) => {
            const position = index + 1;
            const title = `Nota mensual ${position}: decisiones de talento con evidencia`;
            return {
              tenantId: tenantIds[0],
              clientId: clientAId,
              title,
              canonicalTitle: `nota mensual ${position} decisiones de talento con evidencia`,
              objective: `Orientar una decisión de talento ${position}.`,
              audience: 'Gerencias de Recursos Humanos',
              searchIntent: 'Resolver',
              focus: `Aplicación práctica ${position}`,
              status: 'APPROVED' as const,
              duplicateResolution: 'UNIQUE' as const,
              createdById: userAId,
              approvedAt: new Date(),
              versions: {
                create: {
                  version: 1,
                  title,
                  objective: `Orientar una decisión de talento ${position}.`,
                  audience: 'Gerencias de Recursos Humanos',
                  searchIntent: 'Resolver',
                  focus: `Aplicación práctica ${position}`,
                  source: 'AI_ASSISTED' as const,
                  createdById: userAId,
                },
              },
            };
          }),
        },
      },
      include: { titleProposals: { orderBy: { title: 'asc' } } },
    });
    const notes = await Promise.all(
      packageRun.titleProposals.map((proposal, index) =>
        prisma.noteDocument.create({
          data: {
            tenantId: tenantIds[0],
            clientId: clientAId,
            titleProposalId: proposal.id,
            status: 'READY_FOR_REVIEW',
            currentVersion: 1,
            briefSnapshot: { topic: 'Paquete mensual de notas' },
            createdById: userAId,
            versions: {
              create: {
                version: 1,
                title: proposal.title,
                metaTitle: `${proposal.title} | Adecco`,
                metaDescription: `Descripción verificable de la nota mensual ${index + 1} para la revisión del cliente.`,
                slug: `nota-mensual-${index + 1}-decisiones-talento`,
                excerpt: `Resumen editorial de la nota ${index + 1} preparado para el cliente.`,
                content: {
                  schemaVersion: 1,
                  blocks: Array.from({ length: 8 }, (_, blockIndex) => ({
                    id: `p-${blockIndex + 1}`,
                    type: 'paragraph',
                    text: `Contenido verificable ${blockIndex + 1} de la nota ${index + 1}.`,
                  })),
                },
                wordCount: 1200,
                contentHash: `${index + 1}`.repeat(64),
                source: 'AI_ASSISTED',
                createdById: userAId,
              },
            },
          },
        }),
      ),
    );

    const shared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/note-packages/${packageRun.id}`,
      headers: authHeaders(),
      payload: {
        noteIds: notes.map((note) => note.id),
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
      },
    });
    expect(shared.statusCode).toBe(201);
    expect(shared.json()).toMatchObject({ noteCount: 2 });
    const token = new URL(
      shared.json<{ reviewUrl: string }>().reviewUrl,
    ).hash.slice(1);

    const publicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/note-package-reviews/current',
      headers: { 'x-review-token': token },
    });
    expect(publicView.statusCode).toBe(200);
    const publicBody = publicView.json<{
      topic: string;
      recipientEmailHint: string;
      notes: Array<{
        noteId: string;
        version: number;
        content: { image: { status: string } };
      }>;
    }>();
    expect(publicBody).toMatchObject({
      topic: 'Paquete mensual de notas',
      recipientEmailHint: 'a***@cliente.pe',
    });
    expect(new Set(publicBody.notes.map((note) => note.noteId))).toEqual(
      new Set(notes.map((note) => note.id)),
    );
    expect(
      publicBody.notes.every(
        (note) =>
          note.version === 1 && note.content.image.status === 'PROPOSED',
      ),
    ).toBe(true);

    const decided = await app.inject({
      method: 'POST',
      url: '/api/v1/public/note-package-reviews/current/decision',
      headers: { 'x-review-token': token },
      payload: {
        reviewerEmail: 'angie@cliente.pe',
        decisions: [
          { noteId: notes[0]?.id, version: 1, type: 'APPROVE' },
          {
            noteId: notes[1]?.id,
            version: 1,
            type: 'REQUEST_CHANGES',
            reason: 'Ajustar el ejemplo operativo.',
          },
        ],
      },
    });
    expect(decided.statusCode).toBe(201);
    expect(decided.json()).toMatchObject({ accepted: true });
    const decidedNotes = await prisma.noteDocument.findMany({
      where: { id: { in: notes.map((note) => note.id) } },
      select: { id: true, status: true },
    });
    expect(
      Object.fromEntries(decidedNotes.map((note) => [note.id, note.status])),
    ).toEqual({
      [notes[0].id]: 'READY_FOR_REVIEW',
      [notes[1].id]: 'CHANGES_REQUESTED',
    });
    const decidedImages = await prisma.noteImageProposal.findMany({
      where: { noteId: { in: notes.map((note) => note.id) } },
      select: { noteId: true, status: true },
    });
    expect(
      Object.fromEntries(
        decidedImages.map((image) => [image.noteId, image.status]),
      ),
    ).toEqual({
      [notes[0].id]: 'APPROVED',
      [notes[1].id]: 'CHANGES_REQUESTED',
    });
    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/notes?clientId=${clientAId}`,
      headers: authHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    const approvalByNote = Object.fromEntries(
      listed
        .json<Array<{ id: string; clientApprovedCurrentVersion: boolean }>>()
        .filter((note) => notes.some((item) => item.id === note.id))
        .map((note) => [note.id, note.clientApprovedCurrentVersion]),
    );
    expect(approvalByNote).toEqual({
      [notes[0].id]: true,
      [notes[1].id]: false,
    });
  }, 25_000);

  it('completa título, aprobación cliente, nota, QA, aprobación y exportaciones sin mutar la entrega histórica', async () => {
    const title = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Mapeo de puestos críticos para la continuidad del negocio',
        canonicalTitle:
          'mapeo de puestos criticos para la continuidad del negocio',
        objective: 'Preparar una guía editorial útil y verificable.',
        audience: 'Líderes de recursos humanos',
        searchIntent: 'Aprender a mapear puestos críticos',
        focus: 'Continuidad operativa y gestión del talento',
        status: 'PROPOSED',
        duplicateResolution: 'UNIQUE',
        createdById: userAId,
        versions: {
          create: {
            version: 1,
            title: 'Mapeo de puestos críticos para la continuidad del negocio',
            objective: 'Preparar una guía editorial útil y verificable.',
            audience: 'Líderes de recursos humanos',
            searchIntent: 'Aprender a mapear puestos críticos',
            focus: 'Continuidad operativa y gestión del talento',
            source: 'HUMAN',
            createdById: userAId,
          },
        },
        evaluations: {
          create: {
            version: 1,
            status: 'COMPLETED',
            verdict: 'PASS',
            overallScore: 94,
            summary:
              'Título claro, útil, diferenciado y listo para el cliente.',
            requestedById: userAId,
            completedAt: new Date(),
          },
        },
      },
    });

    const titleShared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/titles/${title.id}`,
      headers: authHeaders(),
      payload: {
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
      },
    });
    expect(titleShared.statusCode).toBe(201);
    const titleSharedBody = titleShared.json<{
      id: string;
      reviewUrl: string;
    }>();
    const titleReviewToken = new URL(titleSharedBody.reviewUrl).hash.slice(1);
    expect(titleReviewToken).toHaveLength(43);

    const titleDispatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/review-links/titles/${titleSharedBody.id}/dispatch`,
      headers: authHeaders(),
      payload: {
        senderEmail: 'tecnologia@mood.pe',
        subject: 'Adecco Perú | Revisión de propuesta de título',
        externalMessageId: `e2e-title-${suffix}`,
        confirmedSent: true,
      },
    });
    expect(titleDispatch.statusCode).toBe(200);
    expect(titleDispatch.json()).toMatchObject({
      sentByEmail: 'tecnologia@mood.pe',
      externalMessageId: `e2e-title-${suffix}`,
    });

    const publicTitleView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/title-reviews/current',
      headers: { 'x-review-token': titleReviewToken },
    });
    expect(publicTitleView.statusCode).toBe(200);
    expect(publicTitleView.json()).toMatchObject({
      proposalId: title.id,
      version: 1,
      recipientEmailHint: 'a***@cliente.pe',
      content: {
        title: title.title,
        searchIntent: 'Aprender a mapear puestos críticos',
      },
    });

    const titleApprovedByClient = await app.inject({
      method: 'POST',
      url: '/api/v1/public/title-reviews/current/decision',
      headers: { 'x-review-token': titleReviewToken },
      payload: {
        type: 'APPROVE',
        reviewerEmail: 'angie@cliente.pe',
        reason: 'Título aprobado por Adecco para iniciar la redacción.',
      },
    });
    expect(titleApprovedByClient.statusCode).toBe(201);
    expect(titleApprovedByClient.json()).toMatchObject({
      accepted: true,
      type: 'APPROVE',
      status: 'APPROVED',
    });
    expect(
      await prisma.titleProposal.findUniqueOrThrow({
        where: { id: title.id },
        select: { status: true, approvedAt: true, approvedById: true },
      }),
    ).toMatchObject({
      status: 'APPROVED',
      approvedById: null,
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/notes',
      headers: authHeaders(),
      payload: { titleProposalId: title.id },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json<{ id: string }>();
    const paragraphs = [
      'Cuando una posición clave queda vacante, el problema no empieza con la búsqueda de reemplazo: empieza cuando nadie sabe qué decisiones, relaciones o conocimientos dependen de ella. Un mapa de puestos críticos permite reconocer ese riesgo antes de que afecte la operación y convierte una preocupación difusa en prioridades concretas para talento y negocio. La información oficial de empleo utilizada como contexto está disponible en https://www.gob.pe/mtpe.',
      'Un puesto crítico no siempre es el de mayor jerarquía. Puede ser una función técnica difícil de sustituir, un rol que conecta equipos o una posición cuya ausencia interrumpe un proceso esencial. Por eso, el análisis debe mirar el impacto operativo, la disponibilidad de capacidades y el tiempo real que tomaría recuperar el desempeño esperado.',
      'El primer paso consiste en acordar criterios comunes con quienes conocen la operación. Recursos Humanos puede facilitar el proceso, pero los responsables de cada área deben explicar qué entregables dependen del puesto, qué decisiones no pueden postergarse y qué conocimiento está concentrado. Esa conversación evita que el mapa se reduzca a una lista basada solo en organigramas.',
      'Después conviene valorar cada posición con una escala sencilla y documentada. El equipo puede comparar impacto, escasez, tiempo de reemplazo y nivel de dependencia. Lo importante no es producir una cifra perfecta, sino dejar evidencia suficiente para entender por qué una posición requiere una medida preventiva y otra puede gestionarse mediante el proceso habitual de selección.',
      'La priorización debe traducirse en acciones distintas. Algunos puestos necesitarán planes de sucesión; otros, documentación de procesos, formación cruzada o construcción anticipada de una cantera. Asignar un responsable y una fecha de revisión ayuda a que el ejercicio no quede archivado y permite observar si el riesgo disminuye con el tiempo.',
      'El mapa también necesita mantenimiento. Una nueva tecnología, una reorganización o el crecimiento de una línea de negocio pueden cambiar la importancia de una función. Revisar los criterios con una frecuencia definida y después de cambios relevantes mantiene el análisis conectado con la estrategia, en lugar de conservar una fotografía que pronto deja de representar la realidad.',
      'El resultado más útil es una conversación mejor informada. Con prioridades visibles, la organización puede decidir dónde invertir en desarrollo, qué búsquedas preparar con anticipación y qué conocimiento debe distribuir. Así, el mapeo deja de ser un inventario de cargos y se convierte en una herramienta práctica para proteger la continuidad sin sobredimensionar cada vacante. El aporte institucional de Adecco Perú puede consultarse en https://www.adecco.com/es-pe.',
      'Para llevar el análisis a la práctica, conviene iniciar con un área piloto y documentar tanto los criterios como las decisiones tomadas. Esa primera aplicación permite ajustar la escala, aclarar responsabilidades y demostrar qué información necesita cada responsable. Con el aprendizaje del piloto, Recursos Humanos puede ampliar el ejercicio a otras áreas sin convertirlo en una evaluación burocrática ni perder la conexión con los riesgos reales de la operación. Como referencia secundaria reconocida se utiliza https://www.ilo.org/.',
      'La calidad del resultado depende también de cómo se registran las evidencias. Para cada puesto priorizado, el equipo debería conservar ejemplos de procesos afectados, capacidades escasas, tiempos de cobertura y alternativas temporales disponibles. Esa información permite revisar una calificación sin depender de la memoria de una sola persona y facilita que nuevas jefaturas comprendan por qué se tomó una decisión preventiva.',
      'Otro aspecto relevante es separar criticidad de desempeño individual. El mapa analiza la importancia del puesto para la continuidad, no califica a quien lo ocupa. Comunicar esta diferencia reduce interpretaciones equivocadas y permite conversar sobre sucesión, respaldo y transferencia de conocimiento con mayor transparencia. Las evaluaciones de desempeño pueden aportar contexto, pero requieren un proceso y objetivos distintos.',
      'Cuando dos áreas dependen del mismo conocimiento, la respuesta no siempre consiste en contratar de inmediato. La organización puede documentar actividades, formar reemplazos internos, distribuir autorizaciones o rediseñar una secuencia de trabajo. Comparar estas opciones con su plazo, esfuerzo y riesgo ayuda a seleccionar una medida proporcionada, en lugar de aplicar el mismo plan para todas las posiciones identificadas.',
      'Finalmente, el seguimiento debe mostrar si la exposición realmente cambia. Un tablero sencillo puede registrar responsables, acciones, fechas y señales de avance, como cobertura de respaldo o documentación concluida. Revisar esas señales con las áreas permite corregir retrasos y retirar prioridades que dejaron de ser críticas. El valor del mapa aparece cuando orienta decisiones periódicas y no solo cuando produce un documento inicial.',
    ];
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${note.id}`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 1,
        title: title.title,
        metaTitle: 'Puestos críticos y continuidad del negocio | Adecco',
        metaDescription:
          'Conoce cómo identificar puestos críticos, evaluar riesgos y organizar acciones para fortalecer la continuidad operativa de tu organización.',
        slug: 'mapeo-puestos-criticos-continuidad-negocio',
        excerpt:
          'Una guía práctica para identificar posiciones esenciales, evaluar riesgos y organizar decisiones de talento con evidencia verificable.',
        authorName: 'Especialista de Adecco Perú',
        authorRole: 'Consultoría de talento',
        ctaText:
          'Conversa con Adecco para evaluar los puestos críticos de tu organización.',
        ctaUrl: 'https://www.adecco.com/es-pe/empresas',
        internalLinks: ['https://www.adecco.com/es-pe/blog'],
        sources: [
          {
            type: 'PRIMARY',
            title: 'Información oficial de empleo',
            entity: 'Ministerio de Trabajo',
            url: 'https://www.gob.pe/mtpe',
            publishedAt: '2026-01-15T00:00:00.000Z',
            accessedAt: '2026-08-15T10:00:00.000Z',
          },
          {
            type: 'ADECCO_KNOWLEDGE',
            title: 'Experiencia de Adecco Perú',
            entity: 'Adecco Perú',
            url: 'https://www.adecco.com/es-pe',
            accessedAt: '2026-08-15T10:00:00.000Z',
          },
          {
            type: 'RECOGNIZED_SECONDARY',
            title: 'Gestión del talento',
            entity: 'Organización Internacional del Trabajo',
            url: 'https://www.ilo.org/',
            accessedAt: '2026-08-15T10:00:00.000Z',
          },
        ],
        content: {
          schemaVersion: 1,
          blocks: [
            { id: 'intro', type: 'paragraph', text: paragraphs[0] },
            {
              id: 'h2-1',
              type: 'heading',
              level: 2,
              text: 'Qué es un puesto crítico',
            },
            { id: 'p-1', type: 'paragraph', text: paragraphs[1] },
            {
              id: 'list-1',
              type: 'bullet_list',
              items: [
                'Impacto operativo',
                'Escasez de capacidades',
                'Tiempo de reemplazo',
              ],
            },
            {
              id: 'h2-2',
              type: 'heading',
              level: 2,
              text: 'Cómo realizar el mapeo',
            },
            { id: 'p-2', type: 'paragraph', text: paragraphs[2] },
            {
              id: 'callout-1',
              type: 'callout',
              text: 'Adecco recomienda revisar el mapa con responsables del negocio.',
            },
            { id: 'p-3', type: 'paragraph', text: paragraphs[3] },
            { id: 'p-4', type: 'paragraph', text: paragraphs[4] },
            { id: 'p-5', type: 'paragraph', text: paragraphs[5] },
            { id: 'p-6', type: 'paragraph', text: paragraphs[6] },
            { id: 'p-7', type: 'paragraph', text: paragraphs[7] },
            { id: 'p-8', type: 'paragraph', text: paragraphs[8] },
            { id: 'p-9', type: 'paragraph', text: paragraphs[9] },
            { id: 'p-10', type: 'paragraph', text: paragraphs[10] },
            { id: 'p-11', type: 'paragraph', text: paragraphs[11] },
          ],
        },
        correctionType: 'OTHER',
        reason: 'Completar la primera versión editorial para QA.',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      currentVersion: 2,
      status: 'DRAFT',
    });

    const queued = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/qa`,
      headers: authHeaders(),
      payload: { expectedVersion: 2 },
    });
    expect(queued.statusCode).toBe(201);
    const evaluation = queued.json<{ id: string }>();
    const qaResults = await Promise.all([
      noteQaProcessor.process(evaluation.id, Date.now() + 10_000),
      noteQaProcessor.process(evaluation.id, Date.now() + 10_000),
    ]);
    expect(
      qaResults.filter((result) => result.status === 'COMPLETED'),
    ).toHaveLength(1);
    expect(
      qaResults.some((result) =>
        ['already-running', 'already-completed'].includes(result.status),
      ),
    ).toBe(true);
    expect(
      qaResults.find((result) => result.status === 'COMPLETED'),
    ).toMatchObject({ verdict: 'PASS' });

    const ready = await app.inject({
      method: 'GET',
      url: `/api/v1/notes/${note.id}`,
      headers: authHeaders(),
    });
    expect(ready.statusCode).toBe(200);
    const readyBody = ready.json<{
      status: string;
      currentVersion: number;
      qaEvaluations: Array<{
        version: number;
        status: string;
        verdict: string;
        results: unknown[];
      }>;
    }>();
    expect(readyBody).toMatchObject({
      status: 'READY_FOR_REVIEW',
      currentVersion: 2,
      qaEvaluations: [
        {
          version: 2,
          status: 'COMPLETED',
          verdict: 'PASS',
        },
      ],
    });
    expect(readyBody.qaEvaluations[0]?.results.length).toBeGreaterThan(0);

    const approvalWithoutClientDecision = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/decisions`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 2,
        type: 'APPROVE',
        reason: 'Intento de aprobación antes de la decisión del cliente.',
      },
    });
    expect(approvalWithoutClientDecision.statusCode).toBe(409);
    expect(approvalWithoutClientDecision.json()).toMatchObject({
      message:
        'La aprobación interna exige una aprobación registrada del cliente para esta versión.',
    });

    const shared = await app.inject({
      method: 'POST',
      url: `/api/v1/review-links/notes/${note.id}`,
      headers: authHeaders(),
      payload: {
        expiresInDays: 7,
        recipientName: 'Angie Cliente',
        recipientEmail: 'angie@cliente.pe',
      },
    });
    expect(shared.statusCode).toBe(201);
    const sharedBody = shared.json<{ id: string; reviewUrl: string }>();
    const reviewUrl = sharedBody.reviewUrl;
    const reviewToken = new URL(reviewUrl).hash.slice(1);
    expect(reviewToken).toHaveLength(43);

    const noteDispatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/review-links/notes/${sharedBody.id}/dispatch`,
      headers: authHeaders(),
      payload: {
        senderEmail: 'tecnologia@mood.pe',
        subject: 'Adecco Perú | Revisión y aprobación de nota',
        externalMessageId: `e2e-note-${suffix}`,
        confirmedSent: true,
      },
    });
    expect(noteDispatch.statusCode).toBe(200);
    expect(noteDispatch.json()).toMatchObject({
      sentByEmail: 'tecnologia@mood.pe',
      externalMessageId: `e2e-note-${suffix}`,
    });

    const publicView = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reviews/current',
      headers: { 'x-review-token': reviewToken },
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json()).toMatchObject({
      version: 2,
      recipientName: 'Angie Cliente',
      recipientEmailHint: 'a***@cliente.pe',
      content: {
        slug: 'mapeo-puestos-criticos-continuidad-negocio',
        ctaUrl: 'https://www.adecco.com/es-pe/empresas',
        internalLinks: ['https://www.adecco.com/es-pe/blog'],
      },
    });
    const wrongRecipient = await app.inject({
      method: 'POST',
      url: '/api/v1/public/reviews/current/decision',
      headers: { 'x-review-token': reviewToken },
      payload: {
        type: 'APPROVE',
        reviewerEmail: 'otra-persona@cliente.pe',
        reason: 'Intento con un correo distinto al destinatario autorizado.',
      },
    });
    expect(wrongRecipient.statusCode).toBe(403);
    const clientApproved = await app.inject({
      method: 'POST',
      url: '/api/v1/public/reviews/current/decision',
      headers: { 'x-review-token': reviewToken },
      payload: {
        type: 'APPROVE',
        reviewerEmail: 'angie@cliente.pe',
        reason: 'Versión revisada y aprobada por el cliente.',
      },
    });
    expect(clientApproved.statusCode).toBe(201);
    expect(clientApproved.json()).toMatchObject({
      accepted: true,
      type: 'APPROVE',
    });

    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${note.id}/decisions`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 2,
        type: 'APPROVE',
        reason: 'Contenido y evidencia revisados por una persona autorizada.',
      },
    });
    expect(approved.statusCode).toBe(201);
    expect(approved.json()).toMatchObject({ note: { status: 'APPROVED' } });

    const artifacts: Array<{
      id: string;
      format: 'HTML' | 'DOCX' | 'PDF';
    }> = [];
    for (const format of ['HTML', 'DOCX', 'PDF'] as const) {
      const requested = await app.inject({
        method: 'POST',
        url: `/api/v1/exports/notes/${note.id}`,
        headers: authHeaders(),
        payload: { expectedVersion: 2, format },
      });
      expect(requested.statusCode).toBe(201);
      const artifact = requested.json<{
        id: string;
        format: 'HTML' | 'DOCX' | 'PDF';
        status: string;
      }>();
      expect(artifact).toMatchObject({ format, status: 'QUEUED' });
      const outcomes = await Promise.all([
        exportProcessor.process(artifact.id, Date.now() + 120_000),
        exportProcessor.process(artifact.id, Date.now() + 120_000),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'READY'),
      ).toHaveLength(1);
      expect(
        outcomes.some((outcome) =>
          ['already-running', 'already-completed'].includes(outcome.status),
        ),
      ).toBe(true);
      artifacts.push({ id: artifact.id, format });
    }

    const exportList = await app.inject({
      method: 'GET',
      url: '/api/v1/exports',
      headers: authHeaders(),
    });
    expect(exportList.statusCode).toBe(200);
    expect(
      exportList
        .json<Array<{ noteId: string; status: string }>>()
        .filter((artifact) => artifact.noteId === note.id),
    ).toHaveLength(3);

    for (const artifact of artifacts) {
      const download = await app.inject({
        method: 'GET',
        url: `/api/v1/exports/${artifact.id}/download`,
        headers: authHeaders(),
      });
      expect(download.statusCode).toBe(200);
      expect(download.headers['content-disposition']).toContain('attachment;');
      expect(download.headers['x-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
      if (artifact.format === 'HTML') {
        expect(download.rawPayload.toString('utf8')).toContain(
          '<!doctype html>',
        );
      } else if (artifact.format === 'DOCX') {
        expect(download.rawPayload.subarray(0, 2)).toEqual(
          Buffer.from([0x50, 0x4b]),
        );
      } else {
        expect(download.rawPayload.subarray(0, 5).toString('latin1')).toBe(
          '%PDF-',
        );
      }
    }

    const htmlArtifact = artifacts.find(
      (artifact) => artifact.format === 'HTML',
    );
    expect(htmlArtifact).toBeDefined();
    const dispatchBeforeReview = await app.inject({
      method: 'POST',
      url: `/api/v1/exports/${htmlArtifact!.id}/dispatch`,
      headers: authHeaders(),
      payload: {
        recipientEmail: 'angie@cliente.pe',
        senderEmail: 'tecnologia@mood.pe',
        subject: 'Adecco Perú | Entrega de código HTML aprobado',
        confirmedSent: true,
      },
    });
    expect(dispatchBeforeReview.statusCode).toBe(409);

    const htmlStored = await prisma.exportArtifact.findUniqueOrThrow({
      where: { id: htmlArtifact!.id },
      select: { contentHash: true },
    });
    const verified = await app.inject({
      method: 'POST',
      url: `/api/v1/exports/${htmlArtifact!.id}/verify`,
      headers: authHeaders(),
      payload: {
        expectedContentHash: htmlStored.contentHash,
        visualCheckConfirmed: true,
        contentParityConfirmed: true,
        linksAndMetadataConfirmed: true,
        notes: 'Archivo abierto y comparado con la versión aprobada.',
      },
    });
    expect(verified.statusCode).toBe(201);
    expect(verified.json<{ verifiedAt: string }>().verifiedAt).toEqual(
      expect.any(String),
    );

    const finalDispatch = await app.inject({
      method: 'POST',
      url: `/api/v1/exports/${htmlArtifact!.id}/dispatch`,
      headers: authHeaders(),
      payload: {
        recipientEmail: 'angie@cliente.pe',
        senderEmail: 'tecnologia@mood.pe',
        subject: 'Adecco Perú | Entrega de código HTML aprobado',
        externalMessageId: `e2e-export-${suffix}`,
        confirmedSent: true,
      },
    });
    expect(finalDispatch.statusCode).toBe(201);
    expect(finalDispatch.json()).toMatchObject({
      sentToEmail: 'angie@cliente.pe',
      sentByEmail: 'tecnologia@mood.pe',
      externalMessageId: `e2e-export-${suffix}`,
    });

    const exported = await app.inject({
      method: 'GET',
      url: `/api/v1/notes/${note.id}`,
      headers: authHeaders(),
    });
    expect(exported.statusCode).toBe(200);
    const exportedBody = exported.json<{
      status: string;
      exports: Array<{ status: string; format: string }>;
    }>();
    expect(exportedBody.status).toBe('EXPORTED');
    expect(
      exportedBody.exports
        .filter((artifact) => artifact.status === 'READY')
        .map((artifact) => artifact.format)
        .sort(),
    ).toEqual(['DOCX', 'HTML', 'PDF']);

    const publicationUrl = `https://www.adecco.com/es-pe/blog/mapeo-puestos-criticos-${suffix}`;
    const publicationCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/publications',
      headers: authHeaders(),
      payload: {
        clientId: clientAId,
        noteId: note.id,
        url: publicationUrl,
        publishedAt: '2026-08-18',
      },
    });
    expect(publicationCreated.statusCode).toBe(201);
    expect(publicationCreated.json()).toMatchObject({
      noteId: note.id,
      url: publicationUrl,
      source: 'MANUAL',
      status: 'CONFIRMED',
    });

    const publications = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/publications?clientId=${clientAId}`,
      headers: authHeaders(),
    });
    expect(publications.statusCode).toBe(200);
    expect(publications.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          noteId: note.id,
          url: publicationUrl,
          status: 'CONFIRMED',
        }),
      ]),
    );

    const analyticsSummary = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/summary?clientId=${clientAId}&days=28`,
      headers: authHeaders(),
    });
    expect(analyticsSummary.statusCode).toBe(200);
    expect(analyticsSummary.json()).toMatchObject({
      publicationPerformance: [
        {
          noteId: note.id,
          url: publicationUrl,
          milestones: [
            { days: 30, status: 'IN_PROGRESS' },
            { days: 60, status: 'IN_PROGRESS' },
            { days: 90, status: 'IN_PROGRESS' },
          ],
        },
      ],
    });

    const deliveredVersion = await prisma.noteVersion.findUniqueOrThrow({
      where: { noteId_version: { noteId: note.id, version: 2 } },
    });
    const deliveredArtifacts = await prisma.exportArtifact.findMany({
      where: { noteId: note.id, version: 2 },
      orderBy: { format: 'asc' },
    });
    expect(deliveredArtifacts).toHaveLength(3);

    const correction = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${note.id}`,
      headers: authHeaders(),
      payload: {
        expectedVersion: 2,
        excerpt:
          'Esta corrección posterior a la entrega abre una versión nueva sin modificar los archivos que ya recibió el cliente.',
        correctionType: 'STYLE',
        reason:
          'Aplicar una corrección editorial solicitada después de exportar.',
      },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json()).toMatchObject({
      currentVersion: 3,
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      versions: [
        {
          version: 3,
          excerpt:
            'Esta corrección posterior a la entrega abre una versión nueva sin modificar los archivos que ya recibió el cliente.',
          source: 'HUMAN',
        },
      ],
    });

    expect(
      await prisma.noteVersion.findUniqueOrThrow({
        where: { noteId_version: { noteId: note.id, version: 2 } },
      }),
    ).toEqual(deliveredVersion);
    expect(
      await prisma.exportArtifact.findMany({
        where: { noteId: note.id, version: 2 },
        orderBy: { format: 'asc' },
      }),
    ).toEqual(deliveredArtifacts);
    const revokedReviewLink = await prisma.clientReviewLink.findUniqueOrThrow({
      where: { id: sharedBody.id },
      select: { status: true, revokedById: true, revokedAt: true },
    });
    expect(revokedReviewLink).toMatchObject({
      status: 'REVOKED',
      revokedById: userAId,
    });
    expect(revokedReviewLink.revokedAt).toBeInstanceOf(Date);

    const obsoleteReview = await app.inject({
      method: 'GET',
      url: '/api/v1/public/reviews/current',
      headers: { 'x-review-token': reviewToken },
    });
    expect(obsoleteReview.statusCode).toBe(410);

    const deliveredHtml = artifacts.find(
      (artifact) => artifact.format === 'HTML',
    );
    expect(deliveredHtml).toBeDefined();
    const historicalDownload = await app.inject({
      method: 'GET',
      url: `/api/v1/exports/${deliveredHtml!.id}/download`,
      headers: authHeaders(),
    });
    expect(historicalDownload.statusCode).toBe(200);
    expect(historicalDownload.rawPayload.toString('utf8')).toContain(
      '<!doctype html>',
    );

    const revisionAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantIds[0],
        entityId: note.id,
        action: 'note.version.created',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(revisionAudit.metadata).toMatchObject({
      revisionAfterExport: true,
      revokedReviewLinkCount: 1,
    });
  }, 20_000);

  it('una evaluación obsoleta no altera el estado de la versión vigente', async () => {
    const proposal = await prisma.titleProposal.create({
      data: {
        tenantId: tenantIds[0],
        clientId: clientAId,
        title: 'Versión vigente que mantiene su evaluación activa',
        canonicalTitle: 'version vigente que mantiene su evaluacion activa',
        objective:
          'Evitar que un trabajo anterior modifique el estado vigente.',
        audience: 'Equipo editorial',
        searchIntent: 'Validación técnica',
        focus: 'Trabajos obsoletos',
        status: 'EVALUATING',
        currentVersion: 2,
        createdById: userAId,
        evaluations: {
          create: {
            version: 1,
            status: 'QUEUED',
            requestedById: userAId,
          },
        },
      },
      include: { evaluations: true },
    });
    const result = await titleProcessor.process(
      proposal.evaluations[0].id,
      Date.now() + 5_000,
    );
    expect(result.status).toBe('cancelled-obsolete-version');
    const current = await prisma.titleProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(current.status).toBe('EVALUATING');
  });

  it('rota el refresh token, invalida el anterior y revoca el access token al salir', async () => {
    const login = await loginAsPrimaryUser();
    const loginBody = login.json<{ accessToken: string }>();
    const firstCookie = refreshCookie(login.headers['set-cookie']);

    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: firstCookie },
    });
    expect(refreshed.statusCode).toBe(201);
    const refreshedBody = refreshed.json<{ accessToken: string }>();
    const secondCookie = refreshCookie(refreshed.headers['set-cookie']);
    expect(secondCookie).not.toBe(firstCookie);

    const logoutRequestId = `logout-${suffix}`;
    const logoutUserAgent = `I-HERE-audit/${'u'.repeat(700)}`;
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: secondCookie,
        'user-agent': logoutUserAgent,
        'x-request-id': logoutRequestId,
      },
    });
    expect(logout.statusCode).toBe(201);

    const logoutAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantIds[0],
        action: 'auth.logout',
        requestId: logoutRequestId,
      },
    });
    expect(logoutAudit).toMatchObject({
      userId: userAId,
      actorType: 'USER',
      ipAddress: '127.0.0.1',
      metadata: { reason: 'USER_REQUESTED' },
    });
    expect(logoutAudit.userAgent).toBe(logoutUserAgent.slice(0, 500));
    const serializedLogoutAudit = JSON.stringify(logoutAudit);
    expect(serializedLogoutAudit).not.toContain(secondCookie);
    expect(serializedLogoutAudit).not.toContain(credentials.dni);
    expect(serializedLogoutAudit).not.toContain(credentials.password);

    const invalidRefreshRequestId = `refresh-invalid-${suffix}`;
    const invalidRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        cookie: secondCookie,
        'user-agent': logoutUserAgent,
        'x-request-id': invalidRefreshRequestId,
      },
    });
    expect(invalidRefresh.statusCode).toBe(401);
    const invalidRefreshAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantIds[0],
        action: 'auth.refresh.failed',
        requestId: invalidRefreshRequestId,
      },
    });
    expect(invalidRefreshAudit).toMatchObject({
      userId: userAId,
      actorType: 'SYSTEM',
      metadata: { reason: 'SESSION_REVOKED' },
    });
    const serializedInvalidRefreshAudit = JSON.stringify(invalidRefreshAudit);
    expect(serializedInvalidRefreshAudit).not.toContain(secondCookie);
    expect(serializedInvalidRefreshAudit).not.toContain(credentials.dni);
    expect(serializedInvalidRefreshAudit).not.toContain(credentials.password);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: firstCookie },
    });
    expect(replay.statusCode).toBe(401);

    for (const token of [loginBody.accessToken, refreshedBody.accessToken]) {
      const afterLogout = await app.inject({
        method: 'GET',
        url: '/api/v1/clients',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(afterLogout.statusCode).toBe(401);
    }
  });

  it('permite una sola rotación concurrente y revoca la sesión ante reutilización', async () => {
    const login = await loginAsPrimaryUser();
    expect(login.statusCode).toBe(201);
    const cookie = refreshCookie(login.headers['set-cookie']);
    const reuseRequestId = `refresh-reuse-${suffix}`;
    const reuseUserAgent = `I-HERE-reuse/${'r'.repeat(700)}`;
    const rotations = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          headers: {
            cookie,
            'user-agent': reuseUserAgent,
            'x-request-id': reuseRequestId,
          },
        }),
      ),
    );
    expect(rotations.map((response) => response.statusCode).sort()).toEqual([
      201, 401,
    ]);
    const issuedToken = rotations
      .find((response) => response.statusCode === 201)!
      .json<{ accessToken: string }>().accessToken;
    const afterReuse = await app.inject({
      method: 'GET',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${issuedToken}` },
    });
    expect(afterReuse.statusCode).toBe(401);
    const reuseAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantIds[0],
        action: 'auth.refresh.reuse_detected',
        requestId: reuseRequestId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(reuseAudit).toMatchObject({
      userId: userAId,
      actorType: 'SYSTEM',
      ipAddress: '127.0.0.1',
      metadata: { reason: 'TOKEN_REUSED' },
    });
    expect(reuseAudit.userAgent).toBe(reuseUserAgent.slice(0, 500));
    const serializedReuseAudit = JSON.stringify(reuseAudit);
    expect(serializedReuseAudit).not.toContain(cookie);
    expect(serializedReuseAudit).not.toContain(credentials.dni);
    expect(serializedReuseAudit).not.toContain(credentials.password);
  });

  it('impide iniciar sesión si la cuenta exige MFA todavía no integrado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        tenantCode: tenantCodeA,
        dni: '10000002',
        password: credentials.password,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('audita un login fallido con motivo categórico y contexto recortado sin secretos', async () => {
    const requestId = `login-failure-${suffix}`;
    const userAgent = `I-HERE-login/${'a'.repeat(700)}`;
    const wrongPassword = 'Wrong-password-that-must-never-be-logged!';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '203.0.113.10',
      headers: {
        'user-agent': userAgent,
        'x-request-id': requestId,
      },
      payload: {
        tenantCode: tenantCodeA,
        dni: credentials.dni,
        password: wrongPassword,
      },
    });
    expect(response.statusCode).toBe(401);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantIds[0],
        action: 'auth.login.failed',
        requestId,
      },
    });
    expect(audit).toMatchObject({
      userId: userAId,
      actorType: 'SYSTEM',
      ipAddress: '203.0.113.10',
      metadata: { reason: 'INVALID_PASSWORD' },
    });
    expect(audit.userAgent).toBe(userAgent.slice(0, 500));
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(credentials.dni);
    expect(serializedAudit).not.toContain(credentials.password);
    expect(serializedAudit).not.toContain(wrongPassword);
    expect(serializedAudit).not.toContain('ihere_refresh');
  });

  afterAll(async () => {
    await cleanupFixture();
    await app?.close();
  }, 30_000);

  async function prepareTenantIsolationFixture() {
    tenantCodeA = `e2e-a-${suffix}`;
    const tenantA = await prisma.tenant.create({
      data: { code: tenantCodeA, name: `E2E A ${suffix}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { code: `e2e-b-${suffix}`, name: `E2E B ${suffix}` },
    });
    tenantIds.push(tenantA.id, tenantB.id);

    const [clientA, inactiveClientA, clientB] = await Promise.all([
      prisma.client.create({
        data: {
          tenantId: tenantA.id,
          slug: `client-a-${suffix}`,
          name: 'Cliente A',
          workspaces: { create: { moduleCode: 'automation.notes' } },
        },
      }),
      prisma.client.create({
        data: {
          tenantId: tenantA.id,
          slug: `inactive-a-${suffix}`,
          name: 'Cliente inactivo A',
          active: false,
          workspaces: {
            create: { moduleCode: 'automation.notes', active: false },
          },
        },
      }),
      prisma.client.create({
        data: {
          tenantId: tenantB.id,
          slug: `client-b-${suffix}`,
          name: 'Cliente B',
          workspaces: { create: { moduleCode: 'automation.notes' } },
        },
      }),
    ]);
    clientAId = clientA.id;
    clientBId = clientB.id;

    const userA = await identity.createUser({
      tenantId: tenantA.id,
      dni: credentials.dni,
      password: credentials.password,
      displayName: 'Usuario E2E A',
    });
    await identity.createUser({
      tenantId: tenantA.id,
      dni: '10000002',
      password: credentials.password,
      displayName: 'Usuario MFA E2E',
      mfaRequired: true,
    });
    const userB = await identity.createUser({
      tenantId: tenantB.id,
      dni: '20000001',
      password: credentials.password,
      displayName: 'Usuario E2E B',
    });

    const permissionCodes = [
      'clients.read',
      'titles.read',
      'titles.create',
      'titles.edit',
      'titles.evaluate',
      'titles.review',
      'titles.approve',
      'notes.read',
      'notes.create',
      'notes.edit',
      'notes.qa',
      'notes.review',
      'notes.approve',
      'notes.export',
      'review_links.manage',
      'analytics.read',
      'analytics.manage',
      'roles.manage',
      'users.manage',
    ];
    for (const code of permissionCodes) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: `Permiso de prueba ${code}` },
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    const permissionId = (code: string) =>
      permissions.find((permission) => permission.code === code)!.id;

    const roleA = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        code: `reader-${suffix}`,
        name: 'Lector E2E',
        rolePermissions: {
          create: [
            'clients.read',
            'titles.read',
            'titles.create',
            'titles.edit',
            'titles.evaluate',
            'titles.review',
            'titles.approve',
            'notes.read',
            'notes.create',
            'notes.edit',
            'notes.qa',
            'notes.review',
            'notes.approve',
            'notes.export',
            'review_links.manage',
            'analytics.read',
            'analytics.manage',
          ].map((code) => ({ permissionId: permissionId(code) })),
        },
      },
    });
    const foreignRole = await prisma.role.create({
      data: {
        tenantId: tenantB.id,
        code: `foreign-${suffix}`,
        name: 'Rol cruzado E2E',
        rolePermissions: {
          create: { permissionId: permissionId('roles.manage') },
        },
      },
    });
    const inactiveClientRole = await prisma.role.create({
      data: {
        tenantId: tenantA.id,
        code: `inactive-${suffix}`,
        name: 'Rol cliente inactivo E2E',
        rolePermissions: {
          create: { permissionId: permissionId('users.manage') },
        },
      },
    });
    await prisma.userRole.create({
      data: { userId: userA.id, roleId: roleA.id },
    });
    await expect(
      prisma.userRole.create({
        data: {
          userId: userA.id,
          roleId: foreignRole.id,
          clientId: clientB.id,
        },
      }),
    ).rejects.toThrow();
    await prisma.userRole.create({
      data: {
        userId: userA.id,
        roleId: inactiveClientRole.id,
        clientId: inactiveClientA.id,
      },
    });
    userAId = userA.id;

    const titleB = await prisma.titleProposal.create({
      data: {
        tenantId: tenantB.id,
        clientId: clientB.id,
        title: 'Título privado de otra organización para prueba E2E',
        canonicalTitle: 'titulo privado de otra organizacion para prueba e2e',
        objective: 'Comprobar el aislamiento entre organizaciones.',
        audience: 'Equipo de QA',
        searchIntent: 'Validación técnica',
        focus: 'Aislamiento de datos',
        status: 'APPROVED',
        duplicateResolution: 'UNIQUE',
        createdById: userB.id,
        approvedById: userB.id,
        approvedAt: new Date(),
      },
    });
    titleBId = titleB.id;
    const noteB = await prisma.noteDocument.create({
      data: {
        tenantId: tenantB.id,
        clientId: clientB.id,
        titleProposalId: titleB.id,
        briefSnapshot: { title: titleB.title },
        createdById: userB.id,
        versions: {
          create: {
            version: 1,
            title: titleB.title,
            content: { schemaVersion: 1, blocks: [] },
            contentHash: '0'.repeat(64),
            source: 'SYSTEM',
            createdById: userB.id,
          },
        },
      },
    });
    noteBId = noteB.id;
  }

  async function loginAsPrimaryUser() {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantCode: tenantCodeA, ...credentials },
    });
  }

  function refreshCookie(value: string | string[] | undefined): string {
    const header = Array.isArray(value) ? value[0] : value;
    if (!header) throw new Error('La respuesta no incluyó cookie de refresh.');
    return header.split(';', 1)[0];
  }

  function authHeaders() {
    return { authorization: `Bearer ${primaryToken}` };
  }

  async function cleanupFixture() {
    if (!tenantIds.length) return;
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.exportArtifact.deleteMany({
      where: { note: { tenantId: { in: tenantIds } } },
    });
    await prisma.contentPublication.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.notePackageReviewLink.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.aiGenerationRun.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.noteDocument.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.titleProposal.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { tenantId: { in: tenantIds } } },
    });
    await prisma.session.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
});
