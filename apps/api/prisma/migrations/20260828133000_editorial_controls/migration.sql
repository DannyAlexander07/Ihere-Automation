-- Servicio editorial obligatorio, aprendizaje desde notas y glosario estructurado.
ALTER TABLE "TitleProposal"
  ADD COLUMN "service" VARCHAR(160) NOT NULL DEFAULT 'Servicio por confirmar';

ALTER TABLE "TitleVersion"
  ADD COLUMN "service" VARCHAR(160) NOT NULL DEFAULT 'Servicio por confirmar';

ALTER TABLE "LearningRule"
  ADD COLUMN "glossary" JSONB;

UPDATE "LearningRule"
SET "glossary" = jsonb_build_object(
  'entries',
  jsonb_build_array(
    jsonb_build_object(
      'preferredTerm', 'Outsourcing de Gestión Humana',
      'variants', jsonb_build_array('outsourcing estratégico'),
      'guidance', 'Usar la línea oficial y no inventar categorías comerciales.'
    ),
    jsonb_build_object(
      'preferredTerm', 'RPO',
      'variants', jsonb_build_array('RPO por volumen'),
      'guidance', 'RPO ya comprende procesos de selección por volumen.'
    )
  )
)
WHERE "code" = 'adecco-service-terminology-v1';

ALTER TABLE "CorrectionSignal"
  ALTER COLUMN "proposalId" DROP NOT NULL,
  ALTER COLUMN "versionId" DROP NOT NULL,
  ADD COLUMN "noteId" UUID,
  ADD COLUMN "noteVersionId" UUID;

ALTER TABLE "CorrectionSignal"
  ADD CONSTRAINT "CorrectionSignal_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CorrectionSignal_noteVersionId_fkey"
    FOREIGN KEY ("noteVersionId") REFERENCES "NoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CorrectionSignal_exactly_one_source_check"
    CHECK (
      ("proposalId" IS NOT NULL AND "versionId" IS NOT NULL AND "noteId" IS NULL AND "noteVersionId" IS NULL)
      OR
      ("proposalId" IS NULL AND "versionId" IS NULL AND "noteId" IS NOT NULL AND "noteVersionId" IS NOT NULL)
    );

CREATE INDEX "CorrectionSignal_noteId_noteVersionId_idx"
  ON "CorrectionSignal"("noteId", "noteVersionId");

CREATE OR REPLACE FUNCTION "ihereCheckCorrectionSignalTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_tenant uuid;
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'correction client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."actorId", 'correction actor');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"LearningRule"'::regclass, NEW."promotedRuleId", 'correction rule');

  IF NEW."proposalId" IS NOT NULL THEN
    PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"TitleProposal"'::regclass, NEW."proposalId", 'correction title');
    SELECT tp."tenantId" INTO version_tenant
      FROM "TitleVersion" tv
      JOIN "TitleProposal" tp ON tp.id = tv."proposalId"
     WHERE tv.id = NEW."versionId";
  ELSE
    PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"NoteDocument"'::regclass, NEW."noteId", 'correction note');
    SELECT nd."tenantId" INTO version_tenant
      FROM "NoteVersion" nv
      JOIN "NoteDocument" nd ON nd.id = nv."noteId"
     WHERE nv.id = NEW."noteVersionId";
  END IF;

  IF version_tenant IS NULL OR version_tenant <> NEW."tenantId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tenant mismatch for correction version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CorrectionSignalTenantIntegrity" ON "CorrectionSignal";
CREATE TRIGGER "CorrectionSignalTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "proposalId", "versionId", "noteId", "noteVersionId", "actorId", "promotedRuleId" ON "CorrectionSignal"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckCorrectionSignalTenant"();
