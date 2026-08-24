-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'GENERATING', 'QA_QUEUED', 'QA_RUNNING', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EXPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NoteDecisionType" AS ENUM ('REQUEST_CHANGES', 'APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "NoteDocument" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "titleProposalId" UUID NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "briefSnapshot" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NoteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteVersion" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "metaTitle" VARCHAR(220),
    "metaDescription" VARCHAR(320),
    "slug" VARCHAR(240),
    "excerpt" VARCHAR(800),
    "content" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" CHAR(64) NOT NULL,
    "source" "VersionSource" NOT NULL,
    "correctionType" "CorrectionType",
    "changeReason" VARCHAR(1000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteDecision" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "NoteDecisionType" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actorId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteDocument_titleProposalId_key" ON "NoteDocument"("titleProposalId");

-- CreateIndex
CREATE INDEX "NoteDocument_tenantId_clientId_status_idx" ON "NoteDocument"("tenantId", "clientId", "status");

-- CreateIndex
CREATE INDEX "NoteDocument_clientId_updatedAt_idx" ON "NoteDocument"("clientId", "updatedAt");

-- CreateIndex
CREATE INDEX "NoteVersion_noteId_createdAt_idx" ON "NoteVersion"("noteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NoteVersion_noteId_version_key" ON "NoteVersion"("noteId", "version");

-- CreateIndex
CREATE INDEX "NoteDecision_noteId_version_createdAt_idx" ON "NoteDecision"("noteId", "version", "createdAt");

-- AddForeignKey
ALTER TABLE "NoteDocument" ADD CONSTRAINT "NoteDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDocument" ADD CONSTRAINT "NoteDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDocument" ADD CONSTRAINT "NoteDocument_titleProposalId_fkey" FOREIGN KEY ("titleProposalId") REFERENCES "TitleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDocument" ADD CONSTRAINT "NoteDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDocument" ADD CONSTRAINT "NoteDocument_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDecision" ADD CONSTRAINT "NoteDecision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteDecision" ADD CONSTRAINT "NoteDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
