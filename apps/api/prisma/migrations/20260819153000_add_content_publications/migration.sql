CREATE TYPE "ContentPublicationSource" AS ENUM ('AUTO_DETECTED', 'MANUAL');
CREATE TYPE "ContentPublicationStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'ARCHIVED');

CREATE TABLE "ContentPublication" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "noteId" UUID NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "pagePath" VARCHAR(2048) NOT NULL,
  "publishedAt" DATE NOT NULL,
  "source" "ContentPublicationSource" NOT NULL,
  "status" "ContentPublicationStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "createdById" UUID,
  "confirmedById" UUID,
  "confirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ContentPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPublication_clientId_url_key" ON "ContentPublication"("clientId", "url");
CREATE INDEX "ContentPublication_tenantId_clientId_status_publishedAt_idx" ON "ContentPublication"("tenantId", "clientId", "status", "publishedAt");
CREATE INDEX "ContentPublication_noteId_idx" ON "ContentPublication"("noteId");

ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
