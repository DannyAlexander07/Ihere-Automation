CREATE OR REPLACE FUNCTION "ihereCheckNoteQaTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"NoteDocument"'::regclass, NEW."noteId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."requestedById", 'note QA requester');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NoteQaEvaluationTenantIntegrity"
BEFORE INSERT OR UPDATE OF "noteId", "requestedById" ON "NoteQaEvaluation"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckNoteQaTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckExportArtifactTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"NoteDocument"'::regclass, NEW."noteId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."createdById", 'export creator');
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."verifiedById", 'export verifier');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExportArtifactTenantIntegrity"
BEFORE INSERT OR UPDATE OF "noteId", "createdById", "verifiedById" ON "ExportArtifact"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckExportArtifactTenant"();
