CREATE TYPE "ClientReviewLinkStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ClientReviewDecisionType" AS ENUM ('APPROVE', 'REQUEST_CHANGES', 'REJECT');

CREATE TABLE "ClientReviewLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "noteId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "ClientReviewLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "recipientName" VARCHAR(160),
  "recipientEmail" VARCHAR(254),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "maxViews" INTEGER NOT NULL DEFAULT 50,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMPTZ(3),
  "createdById" UUID NOT NULL,
  "revokedById" UUID,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ClientReviewLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientReviewDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "linkId" UUID NOT NULL,
  "type" "ClientReviewDecisionType" NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "reviewerName" VARCHAR(160) NOT NULL,
  "reviewerEmail" VARCHAR(254) NOT NULL,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientReviewLink_tokenHash_key" ON "ClientReviewLink"("tokenHash");
CREATE INDEX "ClientReviewLink_tenantId_clientId_status_idx" ON "ClientReviewLink"("tenantId", "clientId", "status");
CREATE INDEX "ClientReviewLink_noteId_version_status_idx" ON "ClientReviewLink"("noteId", "version", "status");
CREATE INDEX "ClientReviewLink_expiresAt_status_idx" ON "ClientReviewLink"("expiresAt", "status");
CREATE UNIQUE INDEX "ClientReviewDecision_linkId_key" ON "ClientReviewDecision"("linkId");

ALTER TABLE "ClientReviewLink" ADD CONSTRAINT "ClientReviewLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientReviewLink" ADD CONSTRAINT "ClientReviewLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientReviewLink" ADD CONSTRAINT "ClientReviewLink_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientReviewLink" ADD CONSTRAINT "ClientReviewLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientReviewLink" ADD CONSTRAINT "ClientReviewLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientReviewDecision" ADD CONSTRAINT "ClientReviewDecision_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClientReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
