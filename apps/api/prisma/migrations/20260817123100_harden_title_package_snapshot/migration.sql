ALTER TABLE "TitlePackageReviewItem"
  DROP CONSTRAINT "TitlePackageReviewItem_proposalId_fkey";

ALTER TABLE "TitlePackageReviewItem"
  ADD CONSTRAINT "TitlePackageReviewItem_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "TitleProposal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
