ALTER TABLE "ExportArtifact"
ADD COLUMN "preApproval" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "ExportArtifact_noteId_version_format_key";

CREATE UNIQUE INDEX "ExportArtifact_noteId_version_format_preApproval_key"
ON "ExportArtifact"("noteId", "version", "format", "preApproval");
