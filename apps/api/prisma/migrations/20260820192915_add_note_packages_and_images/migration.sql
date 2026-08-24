-- CreateEnum
CREATE TYPE "NoteImageStatus" AS ENUM ('PROPOSED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateTable
CREATE TABLE "NotePackageReviewLink" (
    "id" UUID NOT NULL,
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

    CONSTRAINT "NotePackageReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePackageReviewItem" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "NotePackageReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePackageReviewDecision" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" "ClientReviewDecisionType" NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "reviewerName" VARCHAR(160) NOT NULL,
    "reviewerEmail" VARCHAR(254) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotePackageReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteImageProposal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "concept" VARCHAR(1000) NOT NULL,
    "prompt" VARCHAR(3000) NOT NULL,
    "altText" VARCHAR(320) NOT NULL,
    "caption" VARCHAR(600),
    "referenceUrl" VARCHAR(2048),
    "status" "NoteImageStatus" NOT NULL DEFAULT 'PROPOSED',
    "decisionReason" VARCHAR(1000),
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NoteImageProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotePackageReviewLink_tokenHash_key" ON "NotePackageReviewLink"("tokenHash");

-- CreateIndex
CREATE INDEX "NotePackageReviewLink_tenantId_clientId_status_idx" ON "NotePackageReviewLink"("tenantId", "clientId", "status");

-- CreateIndex
CREATE INDEX "NotePackageReviewLink_generationRunId_status_idx" ON "NotePackageReviewLink"("generationRunId", "status");

-- CreateIndex
CREATE INDEX "NotePackageReviewLink_expiresAt_status_idx" ON "NotePackageReviewLink"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "NotePackageReviewItem_noteId_version_idx" ON "NotePackageReviewItem"("noteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NotePackageReviewItem_linkId_noteId_key" ON "NotePackageReviewItem"("linkId", "noteId");

-- CreateIndex
CREATE UNIQUE INDEX "NotePackageReviewDecision_itemId_key" ON "NotePackageReviewDecision"("itemId");

-- CreateIndex
CREATE INDEX "NoteImageProposal_tenantId_clientId_status_idx" ON "NoteImageProposal"("tenantId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NoteImageProposal_noteId_version_key" ON "NoteImageProposal"("noteId", "version");

-- AddForeignKey
ALTER TABLE "NotePackageReviewLink" ADD CONSTRAINT "NotePackageReviewLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewLink" ADD CONSTRAINT "NotePackageReviewLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewLink" ADD CONSTRAINT "NotePackageReviewLink_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "AiGenerationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewLink" ADD CONSTRAINT "NotePackageReviewLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewLink" ADD CONSTRAINT "NotePackageReviewLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewItem" ADD CONSTRAINT "NotePackageReviewItem_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "NotePackageReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewItem" ADD CONSTRAINT "NotePackageReviewItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotePackageReviewDecision" ADD CONSTRAINT "NotePackageReviewDecision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NotePackageReviewItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImageProposal" ADD CONSTRAINT "NoteImageProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImageProposal" ADD CONSTRAINT "NoteImageProposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImageProposal" ADD CONSTRAINT "NoteImageProposal_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImageProposal" ADD CONSTRAINT "NoteImageProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImageProposal" ADD CONSTRAINT "NoteImageProposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing current note version receives an editable visual proposal.
INSERT INTO "NoteImageProposal" (
  "id", "tenantId", "clientId", "noteId", "version", "concept", "prompt",
  "altText", "status", "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), n."tenantId", n."clientId", n."id", n."currentVersion",
  'Escena editorial auténtica relacionada con ' || v."title" || ', ambientada en un contexto laboral peruano y sin textos incrustados.',
  'Fotografía editorial profesional y humana para un artículo de Adecco Perú sobre ' || v."title" || '. Personas reales en un entorno laboral peruano, composición natural, luz clara, diversidad auténtica, sin logotipos inventados, sin texto sobre la imagen y sin estética de banco genérico.',
  left('Escena laboral relacionada con ' || v."title", 320),
  'PROPOSED', n."createdById", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "NoteDocument" n
JOIN "NoteVersion" v ON v."noteId" = n."id" AND v."version" = n."currentVersion"
ON CONFLICT ("noteId", "version") DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_note_package_link_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AiGenerationRun" r
    WHERE r."id" = NEW."generationRunId"
      AND r."tenantId" = NEW."tenantId"
      AND r."clientId" = NEW."clientId"
      AND r."kind" = 'TITLE_PROPOSALS'
  ) THEN
    RAISE EXCEPTION 'note package link tenant/client/run mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."createdById" AND u."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'note package link creator tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotePackageReviewLink_integrity"
BEFORE INSERT OR UPDATE ON "NotePackageReviewLink"
FOR EACH ROW EXECUTE FUNCTION enforce_note_package_link_integrity();

CREATE OR REPLACE FUNCTION enforce_note_package_item_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "NotePackageReviewLink" l
    JOIN "NoteDocument" n ON n."id" = NEW."noteId"
    JOIN "TitleProposal" t ON t."id" = n."titleProposalId"
    WHERE l."id" = NEW."linkId"
      AND n."tenantId" = l."tenantId"
      AND n."clientId" = l."clientId"
      AND t."generationRunId" = l."generationRunId"
      AND EXISTS (
        SELECT 1 FROM "NoteVersion" v
        WHERE v."noteId" = n."id" AND v."version" = NEW."version"
      )
  ) THEN
    RAISE EXCEPTION 'note package item scope or version mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotePackageReviewItem_integrity"
BEFORE INSERT OR UPDATE ON "NotePackageReviewItem"
FOR EACH ROW EXECUTE FUNCTION enforce_note_package_item_integrity();

CREATE OR REPLACE FUNCTION enforce_note_image_proposal_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "NoteDocument" n
    WHERE n."id" = NEW."noteId"
      AND n."tenantId" = NEW."tenantId"
      AND n."clientId" = NEW."clientId"
      AND EXISTS (
        SELECT 1 FROM "NoteVersion" v
        WHERE v."noteId" = n."id" AND v."version" = NEW."version"
      )
  ) THEN
    RAISE EXCEPTION 'note image proposal tenant/client/version mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NoteImageProposal_integrity"
BEFORE INSERT OR UPDATE ON "NoteImageProposal"
FOR EACH ROW EXECUTE FUNCTION enforce_note_image_proposal_integrity();
