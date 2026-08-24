import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  LearningRuleStatus,
  Prisma,
  PrismaClient,
  UserStatus,
} from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL es obligatoria para ejecutar el seed.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const permissions = [
  ['clients.read', 'Ver clientes habilitados'],
  ['clients.manage', 'Crear y administrar clientes editoriales'],
  ['clients.delete', 'Eliminar clientes editoriales sin historial'],
  ['users.manage', 'Administrar usuarios y asignaciones'],
  ['roles.manage', 'Administrar roles y permisos'],
  ['titles.read', 'Ver propuestas de títulos'],
  ['titles.create', 'Crear propuestas de títulos'],
  ['titles.edit', 'Editar y versionar propuestas'],
  ['titles.evaluate', 'Solicitar evaluaciones especializadas'],
  ['titles.review', 'Rechazar, solicitar cambios y resolver duplicidad'],
  ['titles.approve', 'Aprobar títulos evaluados'],
  ['titles.publish', 'Marcar títulos aprobados como utilizados'],
  ['audit.read', 'Consultar la bitácora de auditoría'],
  ['notes.read', 'Ver notas y versiones habilitadas'],
  ['notes.create', 'Crear una nota desde un título aprobado'],
  ['notes.edit', 'Editar y versionar notas'],
  ['notes.qa', 'Solicitar y revisar QA de notas'],
  ['notes.review', 'Solicitar cambios o rechazar notas'],
  ['notes.approve', 'Aprobar versiones de notas'],
  ['notes.export', 'Generar y descargar entregables'],
  ['ai.read', 'Consultar ejecuciones inteligentes autorizadas'],
  ['ai.generate', 'Solicitar generaciones inteligentes con presupuesto'],
  ['learning.read', 'Consultar señales y reglas de aprendizaje editorial'],
  ['learning.manage', 'Convertir señales en reglas candidatas'],
  ['learning.approve', 'Activar o retirar reglas de aprendizaje'],
  [
    'learning.restore',
    'Recuperar reglas retiradas con autorización administrativa',
  ],
  [
    'review_links.manage',
    'Crear, consultar y revocar enlaces de revisión del cliente',
  ],
  ['analytics.read', 'Consultar resultados de GA4 y Search Console'],
  ['analytics.manage', 'Conectar y sincronizar fuentes analíticas'],
  [
    'results_links.manage',
    'Crear, consultar y revocar enlaces del portal de resultados',
  ],
] as const;

const automationAccessProfiles = [
  {
    code: 'automation.clients',
    name: 'Clientes editoriales',
    description: 'Crea y administra el CRM de Automatización de notas.',
    permissions: ['clients.read', 'clients.manage'],
  },
  {
    code: 'automation.titles',
    name: 'Propuestas de títulos',
    description: 'Gestiona propuestas, evaluaciones y revisiones de títulos.',
    permissions: [
      'clients.read',
      'titles.read',
      'titles.create',
      'titles.edit',
      'titles.evaluate',
      'ai.read',
      'ai.generate',
    ],
  },
  {
    code: 'automation.notes',
    name: 'Notas',
    description: 'Crea, edita y consulta notas editoriales.',
    permissions: [
      'clients.read',
      'notes.read',
      'notes.create',
      'notes.edit',
      'ai.read',
      'ai.generate',
    ],
  },
  {
    code: 'automation.quality',
    name: 'Control de calidad',
    description: 'Ejecuta y revisa controles de calidad editorial.',
    permissions: [
      'clients.read',
      'titles.read',
      'titles.evaluate',
      'notes.read',
      'notes.qa',
      'ai.read',
    ],
  },
  {
    code: 'automation.approvals',
    name: 'Aprobaciones',
    description: 'Gestiona decisiones y enlaces de revisión con clientes.',
    permissions: [
      'clients.read',
      'titles.read',
      'titles.review',
      'titles.approve',
      'titles.publish',
      'notes.read',
      'notes.review',
      'notes.approve',
      'review_links.manage',
    ],
  },
  {
    code: 'automation.exports',
    name: 'Exportaciones',
    description: 'Genera y descarga entregables aprobados.',
    permissions: ['clients.read', 'notes.read', 'notes.export'],
  },
  {
    code: 'automation.learning',
    name: 'Aprendizaje editorial',
    description: 'Consulta y administra reglas editoriales.',
    permissions: [
      'clients.read',
      'learning.read',
      'learning.manage',
      'learning.approve',
    ],
  },
  {
    code: 'automation.summary',
    name: 'Resumen ejecutivo',
    description: 'Consulta resultados y administra enlaces analíticos.',
    permissions: [
      'clients.read',
      'analytics.read',
      'analytics.manage',
      'results_links.manage',
    ],
  },
] as const;

const automationReadProfiles = [
  {
    code: 'automation.clients.reader',
    name: 'Clientes editoriales · Solo ver',
    description: 'Consulta los clientes editoriales autorizados.',
    permissions: ['clients.read'],
  },
  {
    code: 'automation.titles.reader',
    name: 'Propuestas de títulos · Solo ver',
    description: 'Consulta propuestas y ejecuciones autorizadas.',
    permissions: ['clients.read', 'titles.read', 'ai.read'],
  },
  {
    code: 'automation.notes.reader',
    name: 'Notas · Solo ver',
    description: 'Consulta notas, versiones y ejecuciones autorizadas.',
    permissions: ['clients.read', 'notes.read', 'ai.read'],
  },
  {
    code: 'automation.quality.reader',
    name: 'Control de calidad · Solo ver',
    description: 'Consulta títulos, notas y resultados de calidad.',
    permissions: ['clients.read', 'titles.read', 'notes.read', 'ai.read'],
  },
  {
    code: 'automation.approvals.reader',
    name: 'Aprobaciones · Solo ver',
    description: 'Consulta títulos y notas sin tomar decisiones.',
    permissions: ['clients.read', 'titles.read', 'notes.read'],
  },
  {
    code: 'automation.exports.reader',
    name: 'Exportaciones · Solo ver',
    description: 'Consulta notas aprobadas sin generar entregables.',
    permissions: ['clients.read', 'notes.read'],
  },
  {
    code: 'automation.learning.reader',
    name: 'Aprendizaje editorial · Solo ver',
    description: 'Consulta señales y reglas editoriales.',
    permissions: ['clients.read', 'learning.read'],
  },
  {
    code: 'automation.summary.reader',
    name: 'Resumen ejecutivo · Solo ver',
    description: 'Consulta resultados analíticos autorizados.',
    permissions: ['clients.read', 'analytics.read'],
  },
] as const;

const adeccoEditorialRules = [
  {
    code: 'adecco-service-terminology-v1',
    title: 'Usar la terminología oficial de los servicios de Adecco',
    evidenceCount: 5,
    description:
      'No describir a Adecco como “agencia de empleo”. Usar, según el contexto y la evidencia disponible, “consultora de gestión humana”, “empresa de reclutamiento y selección” o “head hunter”. Respetar nombres oficiales como “Outsourcing de Gestión Humana” y “Facility Management”. No crear categorías genéricas como “outsourcing estratégico”.',
  },
  {
    code: 'adecco-rpo-precision-v1',
    title: 'Evitar expresiones incorrectas o redundantes en RPO',
    evidenceCount: 1,
    description:
      'No usar “RPO por volumen”: el concepto de RPO ya comprende procesos de selección por volumen. Cuando no corresponda RPO, hablar de reclutamiento o selección según el servicio realmente descrito.',
  },
  {
    code: 'adecco-ai-human-balance-v1',
    title: 'Equilibrar tecnología y criterio humano durante toda la nota',
    evidenceCount: 2,
    description:
      'Cuando el tema incluya IA o automatización, presentar la tecnología como apoyo y no como reemplazo total de las personas. El criterio de especialistas y reclutadores debe mantenerse como parte de la propuesta de valor a lo largo de la nota; no basta una aclaración aislada al final.',
  },
  {
    code: 'adecco-service-diversity-v1',
    title: 'Diferenciar los temas por línea de servicio y decisión',
    evidenceCount: 2,
    description:
      'Un lote de títulos no debe repetir el mismo tema con palabras distintas ni concentrarse solo en selección o Payroll. Diversificar, cuando el brief lo permita, entre Training & Consulting, intermediación laboral, Outsourcing de Sales & Marketing, Industrial y Logística, Office, Facility Management y otras líneas oficiales verificadas. Cada propuesta debe responder a un problema e intención distintos.',
  },
  {
    code: 'adecco-legal-evidence-v1',
    title: 'Exigir precisión y revisión especializada en asuntos sensibles',
    evidenceCount: 2,
    description:
      'Las notas sobre intermediación laboral, obligaciones, normativa o cumplimiento requieren fuentes primarias y revisión humana especializada. No afirmar “cumplimiento garantizado”, “siempre cumple” ni equivalentes. Expresar el alcance, las condiciones y los límites de cada afirmación.',
  },
  {
    code: 'adecco-no-unsupported-internal-claims-v1',
    title: 'No inventar experiencia, datos o metodología interna de Adecco',
    evidenceCount: 3,
    description:
      'Solo atribuir a Adecco datos, metodologías, recomendaciones, capacidades o resultados cuando exista una fuente institucional o una validación expresa del cliente. Diferenciar hechos respaldados, análisis editorial y recomendaciones prácticas.',
  },
  {
    code: 'adecco-business-alignment-v1',
    title: 'Alinear las recomendaciones con el servicio real de Adecco',
    evidenceCount: 2,
    description:
      'No recomendar una solución tecnológica autoservida como sustituto de Adecco ni forzar comparaciones que supongan que todas las empresas tienen la misma estructura interna. Cuando sea pertinente, explicar cómo el apoyo especializado puede complementar al equipo del cliente sin convertir la nota en un discurso comercial repetitivo.',
  },
  {
    code: 'adecco-image-context-v1',
    title: 'Proponer imágenes coherentes con el contexto de cada nota',
    evidenceCount: 4,
    description:
      'La imagen debe representar el sector, entorno o servicio de la nota y requiere aprobación humana. En contenidos sobre IA debe mostrar interacción entre tecnología y personas. No reutilizar una imagen genérica si contradice el escenario descrito.',
  },
] as const;

async function seedAdeccoRules(
  tenantId: string,
  clientId: string,
  approvedById?: string,
) {
  for (const rule of adeccoEditorialRules) {
    const existing = await prisma.learningRule.findUnique({
      where: {
        tenantId_clientId_code: { tenantId, clientId, code: rule.code },
      },
      select: { id: true },
    });
    if (existing) continue;
    try {
      await prisma.learningRule.create({
        data: {
          tenantId,
          clientId,
          ...rule,
          status: approvedById
            ? LearningRuleStatus.ACTIVE
            : LearningRuleStatus.DRAFT,
          approvedById: approvedById ?? null,
          approvedAt: approvedById ? new Date() : null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'mood' },
    update: { name: 'Mood' },
    create: { code: 'mood', name: 'Mood' },
  });
  const adecco = await prisma.client.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'adecco-peru' } },
    update: { name: 'Adecco Perú', active: true },
    create: { tenantId: tenant.id, slug: 'adecco-peru', name: 'Adecco Perú' },
  });
  await prisma.clientWorkspace.upsert({
    where: {
      clientId_moduleCode: {
        clientId: adecco.id,
        moduleCode: 'automation.notes',
      },
    },
    update: { active: true },
    create: {
      clientId: adecco.id,
      moduleCode: 'automation.notes',
    },
  });

  for (const [code, description] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
  }
  const allPermissions = await prisma.permission.findMany({
    where: { code: { in: permissions.map(([code]) => code) } },
  });
  const administrator = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'administrator' } },
    update: { name: 'Administrador', isSystem: true },
    create: {
      tenantId: tenant.id,
      code: 'administrator',
      name: 'Administrador',
      description: 'Control operativo completo dentro de la organización.',
      isSystem: true,
    },
  });
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: administrator.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: administrator.id, permissionId: permission.id },
    });
  }

  for (const profile of [
    ...automationAccessProfiles,
    ...automationReadProfiles,
  ]) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: profile.code } },
      update: {
        name: profile.name,
        description: profile.description,
        isSystem: true,
      },
      create: {
        tenantId: tenant.id,
        code: profile.code,
        name: profile.name,
        description: profile.description,
        isSystem: true,
      },
    });
    for (const permission of allPermissions.filter((item) =>
      (profile.permissions as readonly string[]).includes(item.code),
    )) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const dni = process.env.BOOTSTRAP_ADMIN_DNI;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const pepper = process.env.LOGIN_ALIAS_PEPPER;
  if (!dni && !password) {
    const existingApprover = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        status: UserStatus.ACTIVE,
        roles: { some: { roleId: administrator.id, clientId: null } },
      },
      select: { id: true },
    });
    await seedAdeccoRules(tenant.id, adecco.id, existingApprover?.id);
    console.info(
      `Seed base completado sin crear usuario. Reglas Adecco: ${existingApprover ? 'activas con aprobación existente' : 'en borrador hasta aprobación humana'}.`,
    );
    return;
  }
  if (
    !dni ||
    !password ||
    !pepper ||
    !/^\d{8}$/.test(dni) ||
    password.length < 5
  ) {
    throw new Error(
      'El administrador inicial requiere DNI válido, contraseña de 5+ caracteres y LOGIN_ALIAS_PEPPER.',
    );
  }

  const loginAliasDigest = createHmac('sha256', pepper)
    .update(dni)
    .digest('hex');
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const admin = await prisma.user.upsert({
    where: {
      tenantId_loginAliasDigest: { tenantId: tenant.id, loginAliasDigest },
    },
    update: {
      displayName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador I HERE',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || null,
      passwordHash,
      status: 'ACTIVE',
    },
    create: {
      tenantId: tenant.id,
      loginAliasDigest,
      displayName: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador I HERE',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || null,
      passwordHash,
    },
  });
  const assignment = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: administrator.id, clientId: null },
  });
  if (!assignment) {
    await prisma.userRole.create({
      data: { userId: admin.id, roleId: administrator.id },
    });
  }
  await seedAdeccoRules(tenant.id, adecco.id, admin.id);
  console.info('Seed base y administrador inicial completados.');
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Error desconocido en seed.',
    );
    process.exitCode = 1;
  });
