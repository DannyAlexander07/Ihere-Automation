-- Defensa en profundidad: ninguna relación operativa puede cruzar organizaciones.
-- La API filtra por tenant, pero estas restricciones protegen también escrituras
-- directas, scripts administrativos y errores futuros en servicios internos.

CREATE OR REPLACE FUNCTION "ihereTenantOf"(
  relation_name regclass,
  record_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result uuid;
BEGIN
  EXECUTE format('SELECT "tenantId" FROM %s WHERE id = $1', relation_name)
    INTO result
    USING record_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "ihereAssertTenantMatch"(
  expected_tenant uuid,
  relation_name regclass,
  record_id uuid,
  relation_label text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_tenant uuid;
BEGIN
  IF record_id IS NULL THEN
    RETURN;
  END IF;
  actual_tenant := "ihereTenantOf"(relation_name, record_id);
  IF actual_tenant IS NULL OR actual_tenant <> expected_tenant THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('tenant mismatch for %s', relation_label);
  END IF;
END;
$$;

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
  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserRoleTenantIntegrity"
BEFORE INSERT OR UPDATE OF "userId", "roleId", "clientId" ON "UserRole"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckUserRoleTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckSessionTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."userId", 'session user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SessionTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "userId" ON "Session"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckSessionTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitleTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'title client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."createdById", 'title creator');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."approvedById", 'title approver');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"TitleProposal"'::regclass, NEW."duplicateOfId", 'duplicate title');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleProposalTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "createdById", "approvedById", "duplicateOfId" ON "TitleProposal"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitleVersionTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"TitleProposal"'::regclass, NEW."proposalId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."createdById", 'title version creator');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleVersionTenantIntegrity"
BEFORE INSERT OR UPDATE OF "proposalId", "createdById" ON "TitleVersion"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleVersionTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitleEvaluationTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"TitleProposal"'::regclass, NEW."proposalId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."requestedById", 'title evaluation requester');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleEvaluationTenantIntegrity"
BEFORE INSERT OR UPDATE OF "proposalId", "requestedById" ON "TitleEvaluation"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleEvaluationTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitleDecisionTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"TitleProposal"'::regclass, NEW."proposalId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."actorId", 'title decision actor');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleDecisionTenantIntegrity"
BEFORE INSERT OR UPDATE OF "proposalId", "actorId" ON "TitleDecision"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleDecisionTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckCorrectionSignalTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_tenant uuid;
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'correction client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"TitleProposal"'::regclass, NEW."proposalId", 'correction title');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."actorId", 'correction actor');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"LearningRule"'::regclass, NEW."promotedRuleId", 'correction rule');
  SELECT tp."tenantId" INTO version_tenant
    FROM "TitleVersion" tv
    JOIN "TitleProposal" tp ON tp.id = tv."proposalId"
   WHERE tv.id = NEW."versionId";
  IF version_tenant IS NULL OR version_tenant <> NEW."tenantId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tenant mismatch for correction version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CorrectionSignalTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "proposalId", "versionId", "actorId", "promotedRuleId" ON "CorrectionSignal"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckCorrectionSignalTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckLearningRuleTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'learning rule client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."approvedById", 'learning rule approver');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LearningRuleTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "approvedById" ON "LearningRule"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckLearningRuleTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckAuditLogTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'audit client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."userId", 'audit user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditLogTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "userId" ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckAuditLogTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckNoteTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'note client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"TitleProposal"'::regclass, NEW."titleProposalId", 'note title');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."createdById", 'note creator');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."approvedById", 'note approver');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NoteDocumentTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "titleProposalId", "createdById", "approvedById" ON "NoteDocument"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckNoteTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckNoteVersionTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"NoteDocument"'::regclass, NEW."noteId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."createdById", 'note version creator');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NoteVersionTenantIntegrity"
BEFORE INSERT OR UPDATE OF "noteId", "createdById" ON "NoteVersion"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckNoteVersionTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckNoteDecisionTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_tenant uuid;
BEGIN
  expected_tenant := "ihereTenantOf"('"NoteDocument"'::regclass, NEW."noteId");
  PERFORM "ihereAssertTenantMatch"(expected_tenant, '"User"'::regclass, NEW."actorId", 'note decision actor');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "NoteDecisionTenantIntegrity"
BEFORE INSERT OR UPDATE OF "noteId", "actorId" ON "NoteDecision"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckNoteDecisionTenant"();
