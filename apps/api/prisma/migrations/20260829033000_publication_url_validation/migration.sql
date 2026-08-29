CREATE TYPE "PublicationUrlValidationStatus" AS ENUM (
  'PENDING',
  'VALID',
  'REDIRECTED',
  'REVIEW',
  'BROKEN',
  'ERROR'
);

ALTER TABLE "ContentPublication"
  ADD COLUMN "validationStatus" "PublicationUrlValidationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "httpStatus" INTEGER,
  ADD COLUMN "resolvedUrl" VARCHAR(2048),
  ADD COLUMN "canonicalUrl" VARCHAR(2048),
  ADD COLUMN "redirectCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validationMessage" VARCHAR(1000),
  ADD COLUMN "validationCheckedAt" TIMESTAMPTZ(3),
  ADD COLUMN "candidateGroupKey" VARCHAR(64);

CREATE INDEX "ContentPublication_tenantId_clientId_candidateGroupKey_idx"
  ON "ContentPublication"("tenantId", "clientId", "candidateGroupKey");

CREATE INDEX "ContentPublication_validationStatus_validationCheckedAt_idx"
  ON "ContentPublication"("validationStatus", "validationCheckedAt");
