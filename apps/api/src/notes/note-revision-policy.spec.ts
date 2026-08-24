import { NoteStatus } from '../generated/prisma/client';
import { canCreateNoteRevision, canQueueNoteQa } from './note-revision-policy';

describe('note revision policy', () => {
  it.each([
    NoteStatus.DRAFT,
    NoteStatus.CHANGES_REQUESTED,
    NoteStatus.EXPORTED,
  ])('permite crear una versión nueva desde %s', (status) => {
    expect(canCreateNoteRevision(status)).toBe(true);
  });

  it.each([
    NoteStatus.GENERATING,
    NoteStatus.QA_QUEUED,
    NoteStatus.QA_RUNNING,
    NoteStatus.READY_FOR_REVIEW,
    NoteStatus.APPROVED,
    NoteStatus.REJECTED,
    NoteStatus.ARCHIVED,
  ])('no permite crear una versión nueva desde %s', (status) => {
    expect(canCreateNoteRevision(status)).toBe(false);
  });

  it('exige guardar primero la corrección post-exportación antes de enviarla a QA', () => {
    expect(canQueueNoteQa(NoteStatus.EXPORTED)).toBe(false);
    expect(canQueueNoteQa(NoteStatus.DRAFT)).toBe(true);
    expect(canQueueNoteQa(NoteStatus.CHANGES_REQUESTED)).toBe(true);
  });
});
