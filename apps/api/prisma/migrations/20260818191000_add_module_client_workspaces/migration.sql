CREATE TABLE "ClientWorkspace" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "moduleCode" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ClientWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientWorkspace_clientId_moduleCode_key"
ON "ClientWorkspace"("clientId", "moduleCode");

CREATE INDEX "ClientWorkspace_moduleCode_active_idx"
ON "ClientWorkspace"("moduleCode", "active");

ALTER TABLE "ClientWorkspace"
ADD CONSTRAINT "ClientWorkspace_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ClientWorkspace" (
  "id", "clientId", "moduleCode", "active", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "id", 'automation.notes', "active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Client"
ON CONFLICT ("clientId", "moduleCode") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "description")
VALUES (gen_random_uuid(), 'clients.manage', 'Crear y administrar clientes editoriales')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'clients.manage'
WHERE role."code" = 'administrator'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

WITH access_profiles(code, name, description) AS (
  VALUES
    ('automation.clients', 'Clientes editoriales', 'Crea y administra el CRM de Automatización de notas.'),
    ('automation.titles', 'Propuestas de títulos', 'Gestiona propuestas, evaluaciones y revisiones de títulos.'),
    ('automation.notes', 'Notas', 'Crea, edita y consulta notas editoriales.'),
    ('automation.quality', 'Control de calidad', 'Ejecuta y revisa controles de calidad editorial.'),
    ('automation.approvals', 'Aprobaciones', 'Gestiona decisiones y enlaces de revisión con clientes.'),
    ('automation.exports', 'Exportaciones', 'Genera y descarga entregables aprobados.'),
    ('automation.learning', 'Aprendizaje editorial', 'Consulta y administra reglas editoriales.'),
    ('automation.summary', 'Resumen ejecutivo', 'Consulta resultados y administra enlaces analíticos.')
)
INSERT INTO "Role" ("id", "tenantId", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tenant."id", profile.code, profile.name, profile.description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" tenant
CROSS JOIN access_profiles profile
ON CONFLICT ("tenantId", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH profile_permissions(role_code, permission_code) AS (
  VALUES
    ('automation.clients', 'clients.read'),
    ('automation.clients', 'clients.manage'),
    ('automation.titles', 'clients.read'),
    ('automation.titles', 'titles.read'),
    ('automation.titles', 'titles.create'),
    ('automation.titles', 'titles.edit'),
    ('automation.titles', 'titles.evaluate'),
    ('automation.titles', 'ai.read'),
    ('automation.titles', 'ai.generate'),
    ('automation.notes', 'clients.read'),
    ('automation.notes', 'notes.read'),
    ('automation.notes', 'notes.create'),
    ('automation.notes', 'notes.edit'),
    ('automation.notes', 'ai.read'),
    ('automation.notes', 'ai.generate'),
    ('automation.quality', 'clients.read'),
    ('automation.quality', 'titles.read'),
    ('automation.quality', 'titles.evaluate'),
    ('automation.quality', 'notes.read'),
    ('automation.quality', 'notes.qa'),
    ('automation.quality', 'ai.read'),
    ('automation.approvals', 'clients.read'),
    ('automation.approvals', 'titles.read'),
    ('automation.approvals', 'titles.review'),
    ('automation.approvals', 'titles.approve'),
    ('automation.approvals', 'titles.publish'),
    ('automation.approvals', 'notes.read'),
    ('automation.approvals', 'notes.review'),
    ('automation.approvals', 'notes.approve'),
    ('automation.approvals', 'review_links.manage'),
    ('automation.exports', 'clients.read'),
    ('automation.exports', 'notes.read'),
    ('automation.exports', 'notes.export'),
    ('automation.learning', 'clients.read'),
    ('automation.learning', 'learning.read'),
    ('automation.learning', 'learning.manage'),
    ('automation.learning', 'learning.approve'),
    ('automation.summary', 'clients.read'),
    ('automation.summary', 'analytics.read'),
    ('automation.summary', 'analytics.manage'),
    ('automation.summary', 'results_links.manage')
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM profile_permissions profile
JOIN "Role" role ON role."code" = profile.role_code
JOIN "Permission" permission ON permission."code" = profile.permission_code
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
