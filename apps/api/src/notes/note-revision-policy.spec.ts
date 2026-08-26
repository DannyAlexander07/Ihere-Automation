import { NoteStatus } from '../generated/prisma/client';
import { canCreateNoteRevision, canQueueNoteQa } from './note-revision-policy';

describe('note revision policy', () => {
  it.each([
    NoteStatus.DRAFT,
    NoteStatus.CHANGES_REQUESTED,
    NoteStatus.READY_FOR_REVIEW,
    NoteStatus.EXPORTED,
  ])('permite crear una versión nueva desde %s', (status) => {
    expect(canCreateNoteRevision(status)).toBe(true);
  });

  it.each([
    NoteStatus.GENERATING,
    NoteStatus.QA_QUEUED,
    NoteStatus.QA_RUNNING,
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

  it('permite corregir una nota revisable sin reutilizar el QA de su versión anterior', () => {
    expect(canCreateNoteRevision(NoteStatus.READY_FOR_REVIEW)).toBe(true);
    expect(canQueueNoteQa(NoteStatus.READY_FOR_REVIEW)).toBe(false);
  });
});
