-- CreateEnum
CREATE TYPE "AiGenerationKind" AS ENUM ('TITLE_PROPOSALS', 'NOTE_DRAFT');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BUDGET_BLOCKED');

-- AlterTable
ALTER TABLE "NoteVersion" ADD COLUMN     "generationRunId" UUID;

-- AlterTable
ALTER TABLE "TitleProposal" ADD COLUMN     "generationRunId" UUID;

-- CreateTable
CREATE TABLE "AiGenerationRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "noteId" UUID,
    "kind" "AiGenerationKind" NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" UUID NOT NULL,
    "baseVersion" INTEGER,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "reasoningEffort" VARCHAR(20) NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "output" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "webSearchCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "budgetLimitMicros" BIGINT NOT NULL,
    "pricingVersion" VARCHAR(80) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorCode" VARCHAR(100),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentResult" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "AiGenerationStatus" NOT NULL,
    "verdict" "EvaluationVerdict",
    "score" INTEGER,
    "summary" TEXT NOT NULL,
    "findings" JSONB,
    "evidence" JSONB,
    "structuredOutput" JSONB,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "reasoningEffort" VARCHAR(20) NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "webSearchCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationRun_tenantId_clientId_kind_createdAt_idx" ON "AiGenerationRun"("tenantId", "clientId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationRun_status_createdAt_idx" ON "AiGenerationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationRun_noteId_createdAt_idx" ON "AiGenerationRun"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAgentResult_runId_sequence_idx" ON "AiAgentResult"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentResult_runId_agentType_sequence_key" ON "AiAgentResult"("runId", "agentType", "sequence");

-- CreateIndex
CREATE INDEX "NoteVersion_generationRunId_idx" ON "NoteVersion"("generationRunId");

-- CreateIndex
CREATE INDEX "TitleProposal_generationRunId_idx" ON "TitleProposal"("generationRunId");

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "AiGenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "AiGenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationRun" ADD CONSTRAINT "AiGenerationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationRun" ADD CONSTRAINT "AiGenerationRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationRun" ADD CONSTRAINT "AiGenerationRun_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationRun" ADD CONSTRAINT "AiGenerationRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResult" ADD CONSTRAINT "AiAgentResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
