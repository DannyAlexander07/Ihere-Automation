import { VersionSource } from '../generated/prisma/client';

type InitialNoteShell = {
  version: number;
  source: VersionSource;
  wordCount: number;
  generationRunId: string | null;
};

/**
 * A newly-created note contains an empty version 1 so the editor can open it.
 * The first generated draft must fill that shell instead of inventing version 2.
 */
export function shouldReuseInitialNoteShell(
  shell: InitialNoteShell | null,
): boolean {
  return Boolean(
    shell &&
    shell.version === 1 &&
    shell.source === VersionSource.SYSTEM &&
    shell.wordCount === 0 &&
    shell.generationRunId === null,
  );
}
