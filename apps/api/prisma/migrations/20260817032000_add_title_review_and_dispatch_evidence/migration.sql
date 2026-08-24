ALTER TABLE "ClientReviewLink"
  ADD COLUMN "sentByEmail" VARCHAR(254),
  ADD COLUMN "emailSubject" VARCHAR(300),
  ADD COLUMN "externalMessageId" VARCHAR(500),
  ADD COLUMN "sentAt" TIMESTAMPTZ(3);

CREATE TABLE "TitleReviewLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "proposalId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "ClientReviewLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "recipientName" VARCHAR(160) NOT NULL,
  "recipientEmail" VARCHAR(254) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "maxViews" INTEGER NOT NULL DEFAULT 50,
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
  CONSTRAINT "TitleReviewLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitleReviewDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linkId" UUID NOT NULL,
  "type" "ClientReviewDecisionType" NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "reviewerName" VARCHAR(160) NOT NULL,
  "reviewerEmail" VARCHAR(254) NOT NULL,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TitleReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TitleReviewLink_tokenHash_key" ON "TitleReviewLink"("tokenHash");
CREATE INDEX "TitleReviewLink_tenantId_clientId_status_idx" ON "TitleReviewLink"("tenantId", "clientId", "status");
CREATE INDEX "TitleReviewLink_proposalId_version_status_idx" ON "TitleReviewLink"("proposalId", "version", "status");
CREATE INDEX "TitleReviewLink_expiresAt_status_idx" ON "TitleReviewLink"("expiresAt", "status");
CREATE UNIQUE INDEX "TitleReviewDecision_linkId_key" ON "TitleReviewDecision"("linkId");

ALTER TABLE "TitleReviewLink" ADD CONSTRAINT "TitleReviewLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitleReviewLink" ADD CONSTRAINT "TitleReviewLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitleReviewLink" ADD CONSTRAINT "TitleReviewLink_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TitleReviewLink" ADD CONSTRAINT "TitleReviewLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitleReviewLink" ADD CONSTRAINT "TitleReviewLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TitleReviewDecision" ADD CONSTRAINT "TitleReviewDecision_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TitleReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ihereCheckTitleReviewLinkTenant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  proposal_client uuid;
  version_exists boolean;
BEGIN
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"Client"'::regclass, NEW."clientId", 'title review link client');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"TitleProposal"'::regclass, NEW."proposalId", 'title review link proposal');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."createdById", 'title review link creator');
  PERFORM "ihereAssertTenantMatch"(NEW."tenantId", '"User"'::regclass, NEW."revokedById", 'title review link revoker');
  SELECT "clientId" INTO proposal_client FROM "TitleProposal" WHERE id = NEW."proposalId";
  IF proposal_client IS NULL OR proposal_client <> NEW."clientId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'client mismatch for title review link';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM "TitleVersion"
    WHERE "proposalId" = NEW."proposalId" AND version = NEW.version
  ) INTO version_exists;
  IF NOT version_exists THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'version mismatch for title review link';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TitleReviewLinkTenantIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "proposalId", "version", "createdById", "revokedById" ON "TitleReviewLink"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckTitleReviewLinkTenant"();
