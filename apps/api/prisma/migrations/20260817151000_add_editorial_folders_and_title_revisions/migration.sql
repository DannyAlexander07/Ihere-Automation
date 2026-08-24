ALTER TYPE "AiGenerationKind" ADD VALUE IF NOT EXISTS 'TITLE_BRIEF';
ALTER TYPE "AiGenerationKind" ADD VALUE IF NOT EXISTS 'TITLE_REVISION';

ALTER TABLE "AiGenerationRun"
  ADD COLUMN "titleProposalId" UUID,
  ADD COLUMN "campaignYear" INTEGER,
  ADD COLUMN "campaignMonth" INTEGER,
  ADD COLUMN "campaignTopic" VARCHAR(200),
  ADD COLUMN "editorialFolderKey" VARCHAR(300);

ALTER TABLE "AiGenerationRun"
  ADD CONSTRAINT "AiGenerationRun_titleProposalId_fkey"
  FOREIGN KEY ("titleProposalId") REFERENCES "TitleProposal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiGenerationRun"
  ADD CONSTRAINT "AiGenerationRun_campaignMonth_check"
  CHECK ("campaignMonth" IS NULL OR "campaignMonth" BETWEEN 1 AND 12);

ALTER TABLE "AiGenerationRun"
  ADD CONSTRAINT "AiGenerationRun_campaignYear_check"
  CHECK ("campaignYear" IS NULL OR "campaignYear" BETWEEN 2020 AND 2100);

CREATE INDEX "AiGenerationRun_titleProposalId_createdAt_idx"
  ON "AiGenerationRun"("titleProposalId", "createdAt");
CREATE INDEX "AiGenerationRun_tenantId_clientId_editorialFolderKey_createdAt_idx"
  ON "AiGenerationRun"("tenantId", "clientId", "editorialFolderKey", "createdAt");

CREATE OR REPLACE FUNCTION "ihereCheckAiTitleRevisionTarget"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  proposal_tenant uuid;
  proposal_client uuid;
BEGIN
  IF NEW."titleProposalId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "tenantId", "clientId" INTO proposal_tenant, proposal_client
  FROM "TitleProposal" WHERE id = NEW."titleProposalId";
  IF proposal_tenant IS NULL OR proposal_tenant <> NEW."tenantId" OR proposal_client <> NEW."clientId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'title revision target mismatch';
  END IF;
  IF NEW.kind <> 'TITLE_REVISION' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'titleProposalId is only valid for title revisions';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AiGenerationRunTitleRevisionIntegrity"
BEFORE INSERT OR UPDATE OF "tenantId", "clientId", "titleProposalId", kind ON "AiGenerationRun"
FOR EACH ROW EXECUTE FUNCTION "ihereCheckAiTitleRevisionTarget"();
