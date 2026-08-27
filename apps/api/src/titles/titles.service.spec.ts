import type { AuthPrincipal } from '../common/auth/auth-principal';
import { TitlesService } from './titles.service';
import { ConflictException } from '@nestjs/common';

describe('TitlesService', () => {
  it('incluye contexto e historial en el listado revisable', async () => {
    let captured: unknown;
    const findMany = jest.fn(async (input: unknown) => {
      captured = input;
      return Promise.resolve([]);
    });
    const service = new TitlesService(
      { titleProposal: { findMany } } as never,
      {} as never,
    );
    const principal: AuthPrincipal = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      displayName: 'Administrador',
      permissions: ['titles.read'],
      tenantPermissions: ['titles.read'],
      clientPermissions: {},
      clientIds: [],
    };

    await service.list({ clientId: 'client-1' }, principal);

    expect(findMany).toHaveBeenCalledTimes(1);
    const input = captured as {
      select?: Record<string, unknown>;
    };
    expect(input.select).toMatchObject({
      opportunity: true,
      risk: true,
      versions: {
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          title: true,
          changeReason: true,
          correctionType: true,
          source: true,
          createdAt: true,
        },
      },
      decisions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          reason: true,
          version: true,
          duplicateResolution: true,
          createdAt: true,
        },
      },
    });
  });

  it('impide eliminar un título mientras conserve una nota', async () => {
    const service = new TitlesService(
      {
        titleProposal: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'title-1',
            tenantId: 'tenant-1',
            clientId: 'client-1',
            note: { id: 'note-1' },
            evaluations: [],
            revisionRuns: [],
            titlePackageReviewItems: [],
          }),
        },
      } as never,
      {} as never,
    );
    const principal: AuthPrincipal = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      displayName: 'Administrador',
      permissions: ['titles.delete'],
      tenantPermissions: ['titles.delete'],
      clientPermissions: {},
      clientIds: [],
    };

    await expect(service.remove('title-1', principal)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('desvincula ejecuciones antes de borrar un expediente completo', async () => {
    const tx = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      titlePackageReviewLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      titlePackageReviewItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      outboxJob: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiGenerationRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      titleProposal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      titleProposal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'title-1',
            tenantId: 'tenant-1',
            clientId: 'client-1',
            note: null,
            evaluations: [],
            revisionRuns: [{ id: 'revision-1' }],
            titlePackageReviewItems: [],
          },
        ]),
      },
      aiGenerationRun: {
        findMany: jest.fn().mockResolvedValue([{ id: 'revision-1' }]),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new TitlesService(prisma as never, {} as never);
    const principal: AuthPrincipal = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      displayName: 'Administrador',
      permissions: ['titles.delete'],
      tenantPermissions: ['titles.delete'],
      clientPermissions: {},
      clientIds: [],
    };

    await expect(
      service.removeFolder(
        { clientId: 'client-1', folderKey: 'client:2026:8:topic' },
        principal,
      ),
    ).resolves.toEqual({ success: true, deletedTitles: 1 });
    expect(tx.aiGenerationRun.updateMany).toHaveBeenCalledWith({
      where: { titleProposalId: { in: ['title-1'] } },
      data: { titleProposalId: null },
    });
    expect(tx.titleProposal.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['title-1'] }, tenantId: 'tenant-1' },
      data: { generationRunId: null },
    });
    expect(
      tx.titleProposal.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.aiGenerationRun.deleteMany.mock.invocationCallOrder[0]);
  });
});
