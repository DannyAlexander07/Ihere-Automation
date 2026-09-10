CREATE TYPE "AnalyticsRecommendationStatus" AS ENUM ('OPEN', 'IMPLEMENTED', 'DISMISSED');

CREATE TABLE "AnalyticsRecommendation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "detail" VARCHAR(1400) NOT NULL,
  "targetUrl" VARCHAR(2048),
  "priority" VARCHAR(20) NOT NULL,
  "status" "AnalyticsRecommendationStatus" NOT NULL DEFAULT 'OPEN',
  "observationCount" INTEGER NOT NULL DEFAULT 1,
  "firstReportEnd" DATE NOT NULL,
  "lastReportEnd" DATE NOT NULL,
  "implementationNote" VARCHAR(1400),
  "implementedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AnalyticsRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsRecommendation_clientId_fingerprint_key"
ON "AnalyticsRecommendation"("clientId", "fingerprint");

CREATE INDEX "AnalyticsRecommendation_tenantId_clientId_status_lastReportEnd_idx"
ON "AnalyticsRecommendation"("tenantId", "clientId", "status", "lastReportEnd");

ALTER TABLE "AnalyticsRecommendation"
ADD CONSTRAINT "AnalyticsRecommendation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsRecommendation"
ADD CONSTRAINT "AnalyticsRecommendation_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
