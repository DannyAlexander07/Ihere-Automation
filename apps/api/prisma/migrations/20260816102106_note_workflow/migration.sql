-- CreateEnum
CREATE TYPE "NoteQaDimension" AS ENUM ('INTENT_UTILITY', 'ORIGINALITY_EVIDENCE', 'ORGANIZATION_CLARITY', 'SEO_EDITORIAL', 'GEO_AEO_CITABILITY', 'ACTION_ORIENTATION', 'FINAL_QUALITY');

-- CreateEnum
CREATE TYPE "NoteSourceType" AS ENUM ('PRIMARY', 'ADECCO_KNOWLEDGE', 'RECOGNIZED_SECONDARY', 'CONTEXT');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('HTML', 'DOCX', 'PDF');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED', 'INVALID');

-- AlterTable
ALTER TABLE "NoteVersion" ADD COLUMN     "authorName" VARCHAR(160),
ADD COLUMN     "authorRole" VARCHAR(160),
ADD COLUMN     "ctaText" VARCHAR(300),
ADD COLUMN     "ctaUrl" VARCHAR(1000),
ADD COLUMN     "internalLinks" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "NoteSource" (
    "id" UUID NOT NULL,
    "noteVersionId" UUID NOT NULL,
    "type" "NoteSourceType" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "entity" VARCHAR(200) NOT NULL,
    "url" VARCHAR(1200) NOT NULL,
    "publishedAt" DATE,
    "accessedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NoteSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteQaEvaluation" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "EvaluationVerdict",
    "overallScore" INTEGER,
    "summary" TEXT,
    "criticalBlockers" JSONB,
    "requestedById" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteQaEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteQaResult" (
    "id" UUID NOT NULL,
    "evaluationId" UUID NOT NULL,
    "dimension" "NoteQaDimension" NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "verdict" "EvaluationVerdict" NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB,
    "evidence" JSONB,
    "ruleVersion" VARCHAR(80) NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteQaResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "fileName" VARCHAR(300),
    "storageKey" VARCHAR(1000),
    "mimeType" VARCHAR(160),
    "sizeBytes" INTEGER,
    "contentHash" CHAR(64),
    "errorMessage" TEXT,
    "createdById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteSource_noteVersionId_type_idx" ON "NoteSource"("noteVersionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NoteSource_noteVersionId_url_key" ON "NoteSource"("noteVersionId", "url");

-- CreateIndex
CREATE INDEX "NoteQaEvaluation_status_createdAt_idx" ON "NoteQaEvaluation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NoteQaEvaluation_noteId_version_key" ON "NoteQaEvaluation"("noteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NoteQaResult_evaluationId_dimension_key" ON "NoteQaResult"("evaluationId", "dimension");

-- CreateIndex
CREATE INDEX "ExportArtifact_noteId_createdAt_idx" ON "ExportArtifact"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportArtifact_status_createdAt_idx" ON "ExportArtifact"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExportArtifact_noteId_version_format_key" ON "ExportArtifact"("noteId", "version", "format");

-- AddForeignKey
ALTER TABLE "NoteSource" ADD CONSTRAINT "NoteSource_noteVersionId_fkey" FOREIGN KEY ("noteVersionId") REFERENCES "NoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteQaEvaluation" ADD CONSTRAINT "NoteQaEvaluation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteQaEvaluation" ADD CONSTRAINT "NoteQaEvaluation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteQaResult" ADD CONSTRAINT "NoteQaResult_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "NoteQaEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
