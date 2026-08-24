CREATE TABLE "ConsumedRefreshToken" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "digest" CHAR(64) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumedRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumedRefreshToken_digest_key"
  ON "ConsumedRefreshToken"("digest");

CREATE INDEX "ConsumedRefreshToken_sessionId_consumedAt_idx"
  ON "ConsumedRefreshToken"("sessionId", "consumedAt");

ALTER TABLE "ConsumedRefreshToken"
  ADD CONSTRAINT "ConsumedRefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
