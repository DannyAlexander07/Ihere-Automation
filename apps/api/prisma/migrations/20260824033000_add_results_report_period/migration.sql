ALTER TABLE "ResultsPortalLink"
ADD COLUMN "reportStartDate" DATE,
ADD COLUMN "reportEndDate" DATE;

UPDATE "ResultsPortalLink"
SET
  "reportStartDate" = (CURRENT_DATE - INTERVAL '27 days')::date,
  "reportEndDate" = CURRENT_DATE;

ALTER TABLE "ResultsPortalLink"
ALTER COLUMN "reportStartDate" SET NOT NULL,
ALTER COLUMN "reportEndDate" SET NOT NULL;
