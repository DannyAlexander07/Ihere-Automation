import { ConflictException } from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { NoteStatus, TitleStatus } from '../generated/prisma/client';
import { NotesService } from './notes.service';

const principal: AuthPrincipal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  sessionId: 'session-1',
  displayName: 'Administrador',
  permissions: ['notes.delete'],
  tenantPermissions: ['notes.delete'],
  clientPermissions: {},
  clientIds: [],
};

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    titleProposalId: 'title-1',
    status: NoteStatus.EXPORTED,
    currentVersion: 2,
    exports: [{ id: 'export-1', storageKey: 'tenant/client/note.pdf' }],
    generationRuns: [{ id: 'run-1' }],
    qaEvaluations: [{ id: 'qa-1' }],
    notePackageItems: [{ linkId: 'package-1' }],
    contentPublications: [],
    versions: [{ title: 'Nota de prueba' }],
    ...overrides,
  };
}

describe('NotesService deletion', () => {
  it('protege notas vinculadas a publicaciones y sus métricas', async () => {
    const prisma = {
      noteDocument: {
        findFirst: jest.fn().mockResolvedValue(
          note({
            contentPublications: [
              { id: 'publication-1', url: 'https://example.com/blog/nota' },
            ],
          }),
        ),
      },
    };
    const service = new NotesService(prisma as never, {} as never, {} as never);

    await expect(service.remove('note-1', principal)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('elimina dependencias, archivos y devuelve el título aprobado a la cola', async () => {
    const tx = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      outboxJob: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      notePackageReviewItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notePackageReviewLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      exportArtifact: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiGenerationRun: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      noteDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      titleProposal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      noteDocument: { findFirst: jest.fn().mockResolvedValue(note()) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const storage = { removeMany: jest.fn().mockResolvedValue(undefined) };
    const service = new NotesService(
      prisma as never,
      {} as never,
      storage as never,
    );

    await expect(service.remove('note-1', principal)).resolves.toMatchObject({
      success: true,
      deletedNotes: 1,
      deletedExports: 1,
      restoredTitleIds: ['title-1'],
    });
    expect(tx.titleProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['title-1'] },
        tenantId: 'tenant-1',
        status: TitleStatus.USED,
      },
      data: { status: TitleStatus.APPROVED },
    });
    expect(storage.removeMany).toHaveBeenCalledWith(['tenant/client/note.pdf']);
  });
});
