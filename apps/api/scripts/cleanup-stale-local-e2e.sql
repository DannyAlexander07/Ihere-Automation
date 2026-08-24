\set ON_ERROR_STOP on

-- Limpieza local y acotada de tenants creados por suites E2E antiguas.
-- Antes de ejecutar este archivo debe existir un respaldo verificable.
-- El tenant real `mood` queda fuera de los patrones y se valida al final.

BEGIN;

CREATE TEMP TABLE doomed_tenants ON COMMIT DROP AS
SELECT id
FROM "Tenant"
WHERE code LIKE 'admin-e2e-%'
   OR code LIKE 'admin-foreign-%'
   OR code LIKE 'analytics-%'
   OR code LIKE 'e2e-a-%'
   OR code LIKE 'e2e-b-%'
   OR code LIKE 'clients-e2e-%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM doomed_tenants doomed
    JOIN "Tenant" tenant ON tenant.id = doomed.id
    WHERE tenant.code = 'mood'
  ) THEN
    RAISE EXCEPTION 'La selección de limpieza incluye el tenant mood';
  END IF;
END $$;

-- Liberar referencias SET NULL que apuntan a ejecuciones generativas.
UPDATE "NoteVersion" version
SET "generationRunId" = NULL
FROM "NoteDocument" note
WHERE version."noteId" = note.id
  AND note."tenantId" IN (SELECT id FROM doomed_tenants);

UPDATE "TitleProposal"
SET "generationRunId" = NULL
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

-- Artefactos y portales que bloquean la eliminación de notas o títulos.
DELETE FROM "ExportArtifact" artifact
USING "NoteDocument" note
WHERE artifact."noteId" = note.id
  AND note."tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "ContentPublication"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "ClientReviewLink"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "ResultsPortalLink"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "TitlePackageReviewLink"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "TitleReviewLink"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "CorrectionSignal"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "LearningRule"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "AiGenerationRun"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

-- Los descendientes de notas y títulos usan cascada desde sus documentos raíz.
DELETE FROM "NoteDocument"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "TitleProposal"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

-- Analítica y actividad.
DELETE FROM "Ga4PageMetric"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "GscSearchMetric"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "AnalyticsSyncRun"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "AnalyticsOAuthState"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "AnalyticsConnection"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "AuditLog"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "OutboxJob"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "IdempotencyRecord"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "Session"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

-- RBAC, usuarios y clientes de prueba.
DELETE FROM "UserRole" assignment
USING "User" account
WHERE assignment."userId" = account.id
  AND account."tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "Role"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "Client"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "User"
WHERE "tenantId" IN (SELECT id FROM doomed_tenants);

DELETE FROM "Tenant"
WHERE id IN (SELECT id FROM doomed_tenants);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE code = 'mood') THEN
    RAISE EXCEPTION 'El tenant mood no existe después de la limpieza';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Tenant"
    WHERE code LIKE 'admin-e2e-%'
       OR code LIKE 'admin-foreign-%'
       OR code LIKE 'analytics-%'
       OR code LIKE 'e2e-a-%'
       OR code LIKE 'e2e-b-%'
       OR code LIKE 'clients-e2e-%'
  ) THEN
    RAISE EXCEPTION 'Quedaron tenants E2E antiguos después de la limpieza';
  END IF;
END $$;

COMMIT;

SELECT code, name
FROM "Tenant"
ORDER BY code;
