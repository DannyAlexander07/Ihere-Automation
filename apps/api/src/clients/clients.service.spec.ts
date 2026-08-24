import type { AuthPrincipal } from '../common/auth/auth-principal';
import type { PrismaService } from '../database/prisma.service';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  const principal: AuthPrincipal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    displayName: 'Administradora',
    permissions: ['clients.read', 'clients.manage', 'clients.delete'],
    tenantPermissions: ['clients.read', 'clients.manage', 'clients.delete'],
    clientPermissions: {},
    clientIds: [],
  };

  it('lista únicamente los clientes vinculados a Automatización de notas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ClientsService({
      client: { findMany },
    } as unknown as PrismaService);

    await service.list(principal);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest matchers are intentionally untyped at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          tenantId: principal.tenantId,
          workspaces: {
            some: { moduleCode: 'automation.notes' },
          },
        }),
      }),
    );
  });

  it('crea el cliente, su espacio modular y la evidencia de auditoría juntos', async () => {
    const created = {
      id: 'client-1',
      name: 'Cliente Ágil',
      slug: 'cliente-agil',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaces: [
        { id: 'workspace-1', moduleCode: 'automation.notes', active: true },
      ],
    };
    const tx = {
      client: { create: jest.fn().mockResolvedValue(created) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const transaction = jest.fn((work: (client: typeof tx) => unknown) =>
      Promise.resolve(work(tx)),
    );
    const service = new ClientsService({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.create({ name: '  Cliente   Ágil  ' }, principal),
    ).resolves.toEqual(created);
    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          tenantId: principal.tenantId,
          name: 'Cliente Ágil',
          slug: 'cliente-agil',
          workspaces: { create: { moduleCode: 'automation.notes' } },
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          action: 'automation.client.created',
          entityId: created.id,
        }),
      }),
    );
  });

  it('elimina un cliente vacío y conserva evidencia de auditoría', async () => {
    const current = {
      id: 'client-1',
      name: 'Cliente temporal',
      slug: 'cliente-temporal',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaces: [
        { id: 'workspace-1', moduleCode: 'automation.notes', active: true },
      ],
    };
    const tx = {
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      client: { delete: jest.fn().mockResolvedValue(current) },
    };
    const transaction = jest.fn((work: (client: typeof tx) => unknown) =>
      Promise.resolve(work(tx)),
    );
    const service = new ClientsService({
      client: { findFirst: jest.fn().mockResolvedValue(current) },
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(service.remove(current.id, principal)).resolves.toEqual({
      success: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          action: 'automation.client.deleted',
          entityId: current.id,
        }),
      }),
    );
    expect(tx.client.delete).toHaveBeenCalledWith({
      where: { id: current.id },
    });
  });
});
