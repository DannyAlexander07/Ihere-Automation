-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('DRAFT', 'PROPOSED', 'EVALUATING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'USED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DuplicateResolution" AS ENUM ('PENDING', 'UNIQUE', 'CREATE_NEW', 'COMPLEMENT', 'UPDATE_EXISTING', 'MERGE', 'DISCARD');

-- CreateEnum
CREATE TYPE "TitleDecisionType" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES', 'MARK_USED', 'RESOLVE_DUPLICATE');

-- CreateEnum
CREATE TYPE "EvaluationVerdict" AS ENUM ('PASS', 'REVIEW', 'BLOCK', 'ERROR');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SEO_STRATEGIST', 'BRAND_EDITOR', 'RESEARCHER', 'GEO_AEO_AUDITOR', 'DUPLICATE_DETECTOR', 'NORMATIVE_AUDITOR', 'QA_EDITOR', 'JUDGE');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('INTENT', 'SEO', 'BRAND', 'FACTUAL', 'STYLE', 'COMPLIANCE', 'DUPLICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('HUMAN', 'AI_ASSISTED', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LearningRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'SERVICE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "loginAliasDigest" CHAR(64) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "description" VARCHAR(240) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "clientId" UUID,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenDigest" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleProposal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "canonicalTitle" VARCHAR(220) NOT NULL,
    "slug" VARCHAR(240),
    "objective" VARCHAR(600) NOT NULL,
    "audience" VARCHAR(300) NOT NULL,
    "searchIntent" VARCHAR(300) NOT NULL,
    "focus" VARCHAR(500) NOT NULL,
    "opportunity" VARCHAR(600),
    "risk" VARCHAR(600),
    "status" "TitleStatus" NOT NULL DEFAULT 'DRAFT',
    "duplicateScore" INTEGER NOT NULL DEFAULT 0,
    "duplicateResolution" "DuplicateResolution" NOT NULL DEFAULT 'PENDING',
    "duplicateOfId" UUID,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TitleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleVersion" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "objective" VARCHAR(600) NOT NULL,
    "audience" VARCHAR(300) NOT NULL,
    "searchIntent" VARCHAR(300) NOT NULL,
    "focus" VARCHAR(500) NOT NULL,
    "opportunity" VARCHAR(600),
    "risk" VARCHAR(600),
    "source" "VersionSource" NOT NULL,
    "correctionType" "CorrectionType",
    "changeReason" VARCHAR(800),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleEvaluation" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "EvaluationVerdict",
    "overallScore" INTEGER,
    "summary" TEXT,
    "requestedById" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentResult" (
    "id" UUID NOT NULL,
    "evaluationId" UUID NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "verdict" "EvaluationVerdict" NOT NULL,
    "score" INTEGER,
    "summary" TEXT NOT NULL,
    "findings" JSONB,
    "evidence" JSONB,
    "provider" VARCHAR(80),
    "model" VARCHAR(120),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicros" BIGINT,
    "durationMs" INTEGER,
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleDecision" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "TitleDecisionType" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "duplicateResolution" "DuplicateResolution",
    "actorId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionSignal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "field" VARCHAR(80) NOT NULL,
    "beforeValue" TEXT NOT NULL,
    "afterValue" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "correctionType" "CorrectionType" NOT NULL,
    "actorId" UUID NOT NULL,
    "promotedRuleId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRule" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "LearningRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LearningRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID,
    "userId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "action" VARCHAR(160) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100),
    "requestId" VARCHAR(100),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE INDEX "Client_tenantId_active_idx" ON "Client"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_slug_key" ON "Client"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_loginAliasDigest_key" ON "User"("tenantId", "loginAliasDigest");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_clientId_idx" ON "UserRole"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_clientId_key" ON "UserRole"("userId", "roleId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenDigest_key" ON "Session"("refreshTokenDigest");

-- CreateIndex
CREATE INDEX "Session_tenantId_userId_expiresAt_idx" ON "Session"("tenantId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "TitleProposal_tenantId_clientId_status_idx" ON "TitleProposal"("tenantId", "clientId", "status");

-- CreateIndex
CREATE INDEX "TitleProposal_clientId_canonicalTitle_idx" ON "TitleProposal"("clientId", "canonicalTitle");

-- CreateIndex
CREATE INDEX "TitleProposal_duplicateOfId_idx" ON "TitleProposal"("duplicateOfId");

-- CreateIndex
CREATE UNIQUE INDEX "TitleVersion_proposalId_version_key" ON "TitleVersion"("proposalId", "version");

-- CreateIndex
CREATE INDEX "TitleEvaluation_proposalId_version_status_idx" ON "TitleEvaluation"("proposalId", "version", "status");

-- CreateIndex
CREATE INDEX "AgentResult_evaluationId_agentType_idx" ON "AgentResult"("evaluationId", "agentType");

-- CreateIndex
CREATE INDEX "TitleDecision_proposalId_version_createdAt_idx" ON "TitleDecision"("proposalId", "version", "createdAt");

-- CreateIndex
CREATE INDEX "CorrectionSignal_tenantId_clientId_correctionType_idx" ON "CorrectionSignal"("tenantId", "clientId", "correctionType");

-- CreateIndex
CREATE INDEX "CorrectionSignal_proposalId_versionId_idx" ON "CorrectionSignal"("proposalId", "versionId");

-- CreateIndex
CREATE INDEX "LearningRule_tenantId_clientId_status_idx" ON "LearningRule"("tenantId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningRule_tenantId_clientId_code_key" ON "LearningRule"("tenantId", "clientId", "code");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_route_key_key" ON "IdempotencyRecord"("tenantId", "route", "key");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleProposal" ADD CONSTRAINT "TitleProposal_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "TitleProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleVersion" ADD CONSTRAINT "TitleVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleVersion" ADD CONSTRAINT "TitleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleEvaluation" ADD CONSTRAINT "TitleEvaluation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleEvaluation" ADD CONSTRAINT "TitleEvaluation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResult" ADD CONSTRAINT "AgentResult_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "TitleEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleDecision" ADD CONSTRAINT "TitleDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleDecision" ADD CONSTRAINT "TitleDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TitleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionSignal" ADD CONSTRAINT "CorrectionSignal_promotedRuleId_fkey" FOREIGN KEY ("promotedRuleId") REFERENCES "LearningRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRule" ADD CONSTRAINT "LearningRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRule" ADD CONSTRAINT "LearningRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRule" ADD CONSTRAINT "LearningRule_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
