ALTER TABLE "TitlePackageReviewLink"
ADD COLUMN "approvalTarget" INTEGER NOT NULL DEFAULT 4;

UPDATE "TitlePackageReviewLink" AS link
SET "approvalTarget" = LEAST(4, item_count.total)
FROM (
  SELECT "linkId", COUNT(*)::INTEGER AS total
  FROM "TitlePackageReviewItem"
  GROUP BY "linkId"
) AS item_count
WHERE item_count."linkId" = link.id
  AND item_count.total > 0;

ALTER TABLE "TitlePackageReviewLink"
ADD CONSTRAINT "TitlePackageReviewLink_approvalTarget_check"
CHECK ("approvalTarget" BETWEEN 1 AND 4);
