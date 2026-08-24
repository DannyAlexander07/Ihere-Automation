CREATE UNIQUE INDEX "UserRole_tenant_scope_key"
  ON "UserRole"("userId", "roleId")
  WHERE "clientId" IS NULL;

ALTER TABLE "UserRole"
  ADD CONSTRAINT "UserRole_grantedBy_fkey"
  FOREIGN KEY ("grantedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ihereCheckUserRoleTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"User"'::regclass, NEW."userId");
  IF expected_tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tenant missing for user role';
  END IF;
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"Role"'::regclass, NEW."roleId", 'user role');
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"Client"'::regclass, NEW."clientId", 'user role client');
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."grantedBy", 'user role grantor');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "UserRoleTenantIntegrity" ON "UserRole";
CREATE TRIGGER "UserRoleTenantIntegrity"
BEFORE INSERT OR UPDATE OF "userId", "roleId", "clientId", "grantedBy" ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckUserRoleTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckAiGenerationTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  note_client uuid;
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'AI generation client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."requestedById", 'AI generation requester');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"NoteDocument"'::regclass, NEW."noteId", 'AI generation note');
  IF NEW."noteId" IS NOT NULL THEN
    SELECT "clientId" INTO note_client FROM "NoteDocument" WHERE id = NEW."noteId";
    IF note_client IS NULL OR note_client <> NEW."clientId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'client mismatch for AI generation note';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AiGenerationRunTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "noteId", "requestedById" ON "AiGenerationRun"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckAiGenerationTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckClientReviewLinkTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  note_client uuid;
  version_exists boolean;
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'review link client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"NoteDocument"'::regclass, NEW."noteId", 'review link note');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."createdById", 'review link creator');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."revokedById", 'review link revoker');
  SELECT "clientId" INTO note_client FROM "NoteDocument" WHERE id = NEW."noteId";
  IF note_client IS NULL OR note_client <> NEW."clientId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'client mismatch for review link note';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM "NoteVersion"
    WHERE "noteId" = NEW."noteId" AND version = NEW.version
  ) INTO version_exists;
  IF NOT version_exists THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'version mismatch for review link';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClientReviewLinkTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "noteId", "version", "createdById", "revokedById" ON "ClientReviewLink"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckClientReviewLinkTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitleGenerationRun"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_client uuid;
  run_tenant uuid;
BEGIN
  IF NEW."generationRunId" IS NULL THEN RETURN NEW; END IF;
  SELECT "tenantId", "clientId" INTO run_tenant, run_client
    FROM "AiGenerationRun" WHERE id = NEW."generationRunId";
  IF run_tenant IS NULL OR run_tenant <> NEW."tenantId" OR run_client <> NEW."clientId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tenant or client mismatch for title generation run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleGenerationRunIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "generationRunId" ON "TitleProposal"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleGenerationRun"();

CREATE OR REPLACE FUNCTION "ihereCheckNoteVersionGenerationRun"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_note uuid;
BEGIN
  IF NEW."generationRunId" IS NULL THEN RETURN NEW; END IF;
  SELECT "noteId" INTO run_note FROM "AiGenerationRun" WHERE id = NEW."generationRunId";
  IF run_note IS NULL OR run_note <> NEW."noteId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'note mismatch for note generation run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NoteVersionGenerationRunIntegrity"
BEFORE INSERT OR UPDATE OF "noteId", "generationRunId" ON "NoteVersion"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckNoteVersionGenerationRun"();
