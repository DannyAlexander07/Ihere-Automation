CREATE TYPE "AnalyticsConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'REVOKED');
CREATE TYPE "AnalyticsSyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ResultsPortalLinkStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "AnalyticsConnection" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "status" "AnalyticsConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "encryptedRefreshToken" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "googleAccountEmail" VARCHAR(254),
  "ga4PropertyId" VARCHAR(40),
  "gscSiteUrl" VARCHAR(2048),
  "lastSyncStartedAt" TIMESTAMPTZ(3),
  "lastSyncCompletedAt" TIMESTAMPTZ(3),
  "nextSyncAt" TIMESTAMPTZ(3),
  "lastErrorCode" VARCHAR(100),
  "lastErrorMessage" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AnalyticsConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsOAuthState" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "stateHash" CHAR(64) NOT NULL,
  "returnPath" VARCHAR(300) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsSyncRun" (
  "id" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "requestedById" UUID,
  "status" "AnalyticsSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "ga4Rows" INTEGER NOT NULL DEFAULT 0,
  "gscRows" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(100),
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AnalyticsSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ga4PageMetric" (
  "id" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "pagePath" VARCHAR(2048) NOT NULL,
  "sessions" INTEGER NOT NULL DEFAULT 0,
  "activeUsers" INTEGER NOT NULL DEFAULT 0,
  "views" INTEGER NOT NULL DEFAULT 0,
  "engagedSessions" INTEGER NOT NULL DEFAULT 0,
  "keyEvents" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "Ga4PageMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GscSearchMetric" (
  "id" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "page" VARCHAR(2048) NOT NULL,
  "query" VARCHAR(1000) NOT NULL,
  "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "GscSearchMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResultsPortalLink" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "recipientName" VARCHAR(160) NOT NULL,
  "recipientEmail" VARCHAR(254) NOT NULL,
  "status" "ResultsPortalLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "lastViewedAt" TIMESTAMPTZ(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "maxViews" INTEGER NOT NULL DEFAULT 1000,
  "createdById" UUID NOT NULL,
  "revokedById" UUID,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResultsPortalLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsConnection_tenantId_clientId_key" ON "AnalyticsConnection"("tenantId", "clientId");
CREATE INDEX "AnalyticsConnection_status_nextSyncAt_idx" ON "AnalyticsConnection"("status", "nextSyncAt");
CREATE UNIQUE INDEX "AnalyticsOAuthState_stateHash_key" ON "AnalyticsOAuthState"("stateHash");
CREATE INDEX "AnalyticsOAuthState_expiresAt_consumedAt_idx" ON "AnalyticsOAuthState"("expiresAt", "consumedAt");
CREATE INDEX "AnalyticsSyncRun_tenantId_clientId_startedAt_idx" ON "AnalyticsSyncRun"("tenantId", "clientId", "startedAt");
CREATE INDEX "AnalyticsSyncRun_status_startedAt_idx" ON "AnalyticsSyncRun"("status", "startedAt");
CREATE UNIQUE INDEX "Ga4PageMetric_connectionId_date_pagePath_key" ON "Ga4PageMetric"("connectionId", "date", "pagePath");
CREATE INDEX "Ga4PageMetric_tenantId_clientId_date_idx" ON "Ga4PageMetric"("tenantId", "clientId", "date");
CREATE UNIQUE INDEX "GscSearchMetric_connectionId_date_page_query_key" ON "GscSearchMetric"("connectionId", "date", "page", "query");
CREATE INDEX "GscSearchMetric_tenantId_clientId_date_idx" ON "GscSearchMetric"("tenantId", "clientId", "date");
CREATE INDEX "GscSearchMetric_clientId_page_date_idx" ON "GscSearchMetric"("clientId", "page", "date");
CREATE UNIQUE INDEX "ResultsPortalLink_tokenHash_key" ON "ResultsPortalLink"("tokenHash");
CREATE INDEX "ResultsPortalLink_tenantId_clientId_status_expiresAt_idx" ON "ResultsPortalLink"("tenantId", "clientId", "status", "expiresAt");

ALTER TABLE "AnalyticsConnection" ADD CONSTRAINT "AnalyticsConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalyticsConnection" ADD CONSTRAINT "AnalyticsConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalyticsConnection" ADD CONSTRAINT "AnalyticsConnection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalyticsOAuthState" ADD CONSTRAINT "AnalyticsOAuthState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsOAuthState" ADD CONSTRAINT "AnalyticsOAuthState_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsOAuthState" ADD CONSTRAINT "AnalyticsOAuthState_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSyncRun" ADD CONSTRAINT "AnalyticsSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AnalyticsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSyncRun" ADD CONSTRAINT "AnalyticsSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSyncRun" ADD CONSTRAINT "AnalyticsSyncRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSyncRun" ADD CONSTRAINT "AnalyticsSyncRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ga4PageMetric" ADD CONSTRAINT "Ga4PageMetric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AnalyticsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ga4PageMetric" ADD CONSTRAINT "Ga4PageMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ga4PageMetric" ADD CONSTRAINT "Ga4PageMetric_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GscSearchMetric" ADD CONSTRAINT "GscSearchMetric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AnalyticsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GscSearchMetric" ADD CONSTRAINT "GscSearchMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GscSearchMetric" ADD CONSTRAINT "GscSearchMetric_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultsPortalLink" ADD CONSTRAINT "ResultsPortalLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultsPortalLink" ADD CONSTRAINT "ResultsPortalLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultsPortalLink" ADD CONSTRAINT "ResultsPortalLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultsPortalLink" ADD CONSTRAINT "ResultsPortalLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION ihere_assert_client_tenant(p_tenant UUID, p_client UUID) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Client" WHERE "id" = p_client AND "tenantId" = p_tenant) THEN
    RAISE EXCEPTION 'analytics tenant/client mismatch';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_assert_user_tenant(p_tenant UUID, p_user UUID) RETURNS void AS $$
BEGIN
  IF p_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = p_user AND "tenantId" = p_tenant) THEN
    RAISE EXCEPTION 'analytics tenant/user mismatch';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_analytics_connection_integrity() RETURNS trigger AS $$
BEGIN
  PERFORM ihere_assert_client_tenant(NEW."tenantId", NEW."clientId");
  PERFORM ihere_assert_user_tenant(NEW."tenantId", NEW."createdById");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_analytics_oauth_integrity() RETURNS trigger AS $$
BEGIN
  PERFORM ihere_assert_client_tenant(NEW."tenantId", NEW."clientId");
  PERFORM ihere_assert_user_tenant(NEW."tenantId", NEW."requestedById");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_analytics_sync_integrity() RETURNS trigger AS $$
BEGIN
  PERFORM ihere_assert_client_tenant(NEW."tenantId", NEW."clientId");
  PERFORM ihere_assert_user_tenant(NEW."tenantId", NEW."requestedById");
  IF NOT EXISTS (SELECT 1 FROM "AnalyticsConnection" WHERE "id" = NEW."connectionId" AND "tenantId" = NEW."tenantId" AND "clientId" = NEW."clientId") THEN
    RAISE EXCEPTION 'analytics sync connection mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_analytics_metric_integrity() RETURNS trigger AS $$
BEGIN
  PERFORM ihere_assert_client_tenant(NEW."tenantId", NEW."clientId");
  IF NOT EXISTS (SELECT 1 FROM "AnalyticsConnection" WHERE "id" = NEW."connectionId" AND "tenantId" = NEW."tenantId" AND "clientId" = NEW."clientId") THEN
    RAISE EXCEPTION 'analytics metric connection mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ihere_results_link_integrity() RETURNS trigger AS $$
BEGIN
  PERFORM ihere_assert_client_tenant(NEW."tenantId", NEW."clientId");
  PERFORM ihere_assert_user_tenant(NEW."tenantId", NEW."createdById");
  PERFORM ihere_assert_user_tenant(NEW."tenantId", NEW."revokedById");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AnalyticsConnection_tenant_integrity" BEFORE INSERT OR UPDATE ON "AnalyticsConnection" FOR EACH ROW EXECUTE FUNCTION ihere_analytics_connection_integrity();
CREATE TRIGGER "AnalyticsOAuthState_tenant_integrity" BEFORE INSERT OR UPDATE ON "AnalyticsOAuthState" FOR EACH ROW EXECUTE FUNCTION ihere_analytics_oauth_integrity();
CREATE TRIGGER "AnalyticsSyncRun_tenant_integrity" BEFORE INSERT OR UPDATE ON "AnalyticsSyncRun" FOR EACH ROW EXECUTE FUNCTION ihere_analytics_sync_integrity();
CREATE TRIGGER "Ga4PageMetric_tenant_integrity" BEFORE INSERT OR UPDATE ON "Ga4PageMetric" FOR EACH ROW EXECUTE FUNCTION ihere_analytics_metric_integrity();
CREATE TRIGGER "GscSearchMetric_tenant_integrity" BEFORE INSERT OR UPDATE ON "GscSearchMetric" FOR EACH ROW EXECUTE FUNCTION ihere_analytics_metric_integrity();
CREATE TRIGGER "ResultsPortalLink_tenant_integrity" BEFORE INSERT OR UPDATE ON "ResultsPortalLink" FOR EACH ROW EXECUTE FUNCTION ihere_results_link_integrity();
