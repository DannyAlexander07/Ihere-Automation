CREATE TABLE "TitlePackageReviewLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "generationRunId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "ClientReviewLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "recipientName" VARCHAR(160) NOT NULL,
  "recipientEmail" VARCHAR(254) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "maxViews" INTEGER NOT NULL DEFAULT 100,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMPTZ(3),
  "createdById" UUID NOT NULL,
  "revokedById" UUID,
  "revokedAt" TIMESTAMPTZ(3),
  "sentByEmail" VARCHAR(254),
  "emailSubject" VARCHAR(300),
  "externalMessageId" VARCHAR(500),
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TitlePackageReviewLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitlePackageReviewItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linkId" UUID NOT NULL,
  "proposalId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "TitlePackageReviewItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitlePackageReviewDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL,
  "type" "ClientReviewDecisionType" NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "reviewerName" VARCHAR(160) NOT NULL,
  "reviewerEmail" VARCHAR(254) NOT NULL,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TitlePackageReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TitlePackageReviewLink_tokenHash_key" ON "TitlePackageReviewLink"("tokenHash");
CREATE INDEX "TitlePackageReviewLink_tenantId_clientId_status_idx" ON "TitlePackageReviewLink"("tenantId", "clientId", "status");
CREATE INDEX "TitlePackageReviewLink_generationRunId_status_idx" ON "TitlePackageReviewLink"("generationRunId", "status");
CREATE INDEX "TitlePackageReviewLink_expiresAt_status_idx" ON "TitlePackageReviewLink"("expiresAt", "status");
CREATE UNIQUE INDEX "TitlePackageReviewItem_linkId_proposalId_key" ON "TitlePackageReviewItem"("linkId", "proposalId");
CREATE INDEX "TitlePackageReviewItem_proposalId_version_idx" ON "TitlePackageReviewItem"("proposalId", "version");
CREATE UNIQUE INDEX "TitlePackageReviewDecision_itemId_key" ON "TitlePackageReviewDecision"("itemId");

ALTER TABLE "TitlePackageReviewLink" ADD CONSTRAINT "TitlePackageReviewLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewLink" ADD CONSTRAINT "TitlePackageReviewLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewLink" ADD CONSTRAINT "TitlePackageReviewLink_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "AiGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewLink" ADD CONSTRAINT "TitlePackageReviewLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewLink" ADD CONSTRAINT "TitlePackageReviewLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewItem" ADD CONSTRAINT "TitlePackageReviewItem_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TitlePackageReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewItem" ADD CONSTRAINT "TitlePackageReviewItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TitlePackageReviewDecision" ADD CONSTRAINT "TitlePackageReviewDecision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TitlePackageReviewItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ihereCheckTitlePackageReviewLinkTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_client uuid;
  run_kind "AiGenerationKind";
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'title package review client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"AiGenerationRun"'::regclass, NEW."generationRunId", 'title package review run');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."createdById", 'title package review creator');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."revokedById", 'title package review revoker');
  SELECT "clientId", kind INTO run_client, run_kind FROM "AiGenerationRun" WHERE id = NEW."generationRunId";
  IF run_client IS NULL OR run_client <> NEW."clientId" OR run_kind <> 'TITLE_PROPOSALS' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'generation run mismatch for title package review link';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitlePackageReviewLinkTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "generationRunId", "createdById", "revokedById" ON "TitlePackageReviewLink"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitlePackageReviewLinkTenant"();

CREATE OR REPLACE FUNCTION "ihereCheckTitlePackageReviewItem"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  link_tenant uuid;
  link_client uuid;
  link_run uuid;
  proposal_tenant uuid;
  proposal_client uuid;
  proposal_run uuid;
  version_exists boolean;
BEGIN
  SELECT "tenantId", "clientId", "generationRunId" INTO link_tenant, link_client, link_run
  FROM "TitlePackageReviewLink" WHERE id = NEW."linkId";
  SELECT "tenantId", "clientId", "generationRunId" INTO proposal_tenant, proposal_client, proposal_run
  FROM "TitleProposal" WHERE id = NEW."proposalId";
  IF link_tenant IS NULL OR proposal_tenant IS NULL OR link_tenant <> proposal_tenant OR link_client <> proposal_client OR link_run <> proposal_run THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'proposal mismatch for title package review item';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM "TitleVersion"
    WHERE "proposalId" = NEW."proposalId" AND version = NEW.version
  ) INTO version_exists;
  IF NOT version_exists THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'version mismatch for title package review item';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitlePackageReviewItemIntegrity"
BEFORE INSERT OR UPDATE OF "linkId", "proposalId", "version" ON "TitlePackageReviewItem"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitlePackageReviewItem"();
