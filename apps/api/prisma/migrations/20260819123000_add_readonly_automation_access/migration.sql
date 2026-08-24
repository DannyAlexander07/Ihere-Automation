WITH profiles(code, name, description) AS (
  VALUES
    ('automation.clients.reader', 'Clientes editoriales · Solo ver', 'Consulta los clientes editoriales autorizados.'),
    ('automation.titles.reader', 'Propuestas de títulos · Solo ver', 'Consulta propuestas y ejecuciones autorizadas.'),
    ('automation.notes.reader', 'Notas · Solo ver', 'Consulta notas, versiones y ejecuciones autorizadas.'),
    ('automation.quality.reader', 'Control de calidad · Solo ver', 'Consulta títulos, notas y resultados de calidad.'),
    ('automation.approvals.reader', 'Aprobaciones · Solo ver', 'Consulta títulos y notas sin tomar decisiones.'),
    ('automation.exports.reader', 'Exportaciones · Solo ver', 'Consulta notas aprobadas sin generar entregables.'),
    ('automation.learning.reader', 'Aprendizaje editorial · Solo ver', 'Consulta señales y reglas editoriales.'),
    ('automation.summary.reader', 'Resumen ejecutivo · Solo ver', 'Consulta resultados analíticos autorizados.')
)
INSERT INTO "Role" ("id", "tenantId", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tenant."id", profiles.code, profiles.name, profiles.description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" tenant
CROSS JOIN profiles
ON CONFLICT ("tenantId", "code") DO UPDATE
SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "isSystem" = true, "updatedAt" = CURRENT_TIMESTAMP;

WITH profile_permissions(role_code, permission_code) AS (
  VALUES
    ('automation.clients.reader', 'clients.read'),
    ('automation.titles.reader', 'clients.read'),
    ('automation.titles.reader', 'titles.read'),
    ('automation.titles.reader', 'ai.read'),
    ('automation.notes.reader', 'clients.read'),
    ('automation.notes.reader', 'notes.read'),
    ('automation.notes.reader', 'ai.read'),
    ('automation.quality.reader', 'clients.read'),
    ('automation.quality.reader', 'titles.read'),
    ('automation.quality.reader', 'notes.read'),
    ('automation.quality.reader', 'ai.read'),
    ('automation.approvals.reader', 'clients.read'),
    ('automation.approvals.reader', 'titles.read'),
    ('automation.approvals.reader', 'notes.read'),
    ('automation.exports.reader', 'clients.read'),
    ('automation.exports.reader', 'notes.read'),
    ('automation.learning.reader', 'clients.read'),
    ('automation.learning.reader', 'learning.read'),
    ('automation.summary.reader', 'clients.read'),
    ('automation.summary.reader', 'analytics.read')
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN profile_permissions mapping ON mapping.role_code = role."code"
JOIN "Permission" permission ON permission."code" = mapping.permission_code
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
