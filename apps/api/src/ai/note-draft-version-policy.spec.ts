import { VersionSource } from '../generated/prisma/client';
import { shouldReuseInitialNoteShell } from './note-draft-version-policy';

describe('shouldReuseInitialNoteShell', () => {
  it('reutiliza únicamente la versión 1 vacía creada por el sistema', () => {
    expect(
      shouldReuseInitialNoteShell({
        version: 1,
        source: VersionSource.SYSTEM,
        wordCount: 0,
        generationRunId: null,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    {
      version: 2,
      source: VersionSource.SYSTEM,
      wordCount: 0,
      generationRunId: null,
    },
    {
      version: 1,
      source: VersionSource.HUMAN,
      wordCount: 0,
      generationRunId: null,
    },
    {
      version: 1,
      source: VersionSource.SYSTEM,
      wordCount: 12,
      generationRunId: null,
    },
    {
      version: 1,
      source: VersionSource.SYSTEM,
      wordCount: 0,
      generationRunId: 'run-1',
    },
  ])('conserva el versionado normal para %p', (shell) => {
    expect(shouldReuseInitialNoteShell(shell)).toBe(false);
  });
});
