import { NoteStatus } from '../generated/prisma/client';

const revisionSourceStatuses = new Set<NoteStatus>([
  NoteStatus.DRAFT,
  NoteStatus.CHANGES_REQUESTED,
  NoteStatus.READY_FOR_REVIEW,
  NoteStatus.EXPORTED,
]);

const qaQueueStatuses = new Set<NoteStatus>([
  NoteStatus.DRAFT,
  NoteStatus.CHANGES_REQUESTED,
]);

export function canCreateNoteRevision(status: NoteStatus) {
  return revisionSourceStatuses.has(status);
}

export function canQueueNoteQa(status: NoteStatus) {
  return qaQueueStatuses.has(status);
}
