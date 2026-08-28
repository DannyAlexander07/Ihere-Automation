-- Las publicaciones subidas por el equipo web del cliente pueden medirse aunque
-- no tengan una nota de I HERE asociada.
ALTER TABLE "ContentPublication"
  ADD COLUMN "title" VARCHAR(500);

UPDATE "ContentPublication" publication
SET "title" = COALESCE(
  (
    SELECT version."title"
    FROM "NoteVersion" version
    WHERE version."noteId" = publication."noteId"
    ORDER BY version."version" DESC
    LIMIT 1
  ),
  'Artículo publicado'
);

ALTER TABLE "ContentPublication"
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "noteId" DROP NOT NULL;

ALTER TABLE "ContentPublication"
  DROP CONSTRAINT "ContentPublication_noteId_fkey";

ALTER TABLE "ContentPublication"
  ADD CONSTRAINT "ContentPublication_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "NoteDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
