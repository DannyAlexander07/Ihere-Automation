import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { LearningRuleStatus } from '../generated/prisma/client';
import { LearningService } from './learning.service';

describe('LearningService', () => {
  const rule = {
    id: '00000000-0000-4000-8000-000000000101',
    tenantId: '00000000-0000-4000-8000-000000000001',
    clientId: '00000000-0000-4000-8000-000000000002',
    code: 'brand-rule',
    title: 'Regla de marca',
    description: 'Descripción comprobable de la regla.',
    status: LearningRuleStatus.RETIRED,
    evidenceCount: 2,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date('2026-08-17T10:00:00.000Z'),
    updatedAt: new Date('2026-08-17T10:00:00.000Z'),
  };

  it('rechaza la recuperación sin permiso administrativo tenant-wide', async () => {
    const findFirst = jest.fn();
    const service = new LearningService({
      learningRule: { findFirst },
    } as never);

    await expect(
      service.restore(rule.id, principal([])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('solo permite recuperar una regla retirada', async () => {
    const service = new LearningService({
      learningRule: {
        findFirst: jest.fn().mockResolvedValue({
          ...rule,
          status: LearningRuleStatus.ACTIVE,
        }),
      },
    } as never);

    await expect(
      service.restore(rule.id, principal(['learning.restore'])),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recupera con CAS y registra la decisión del administrador', async () => {
    const restored = {
      ...rule,
      status: LearningRuleStatus.ACTIVE,
      approvedById: '00000000-0000-4000-8000-000000000003',
      approvedAt: new Date('2026-08-17T11:00:00.000Z'),
    };
    const updateMany = jest.fn(
      (input: {
        where: { id: string; tenantId: string; status: LearningRuleStatus };
        data: Record<string, unknown>;
      }) => {
        void input;
        return Promise.resolve({ count: 1 });
      },
    );
    const findUniqueOrThrow = jest.fn().mockResolvedValue(restored);
    const createAudit = jest.fn(
      (input: {
        data: {
          action: string;
          before: { status: LearningRuleStatus };
          after: { status: LearningRuleStatus };
        };
      }) => {
        void input;
        return Promise.resolve({ id: 'audit-1' });
      },
    );
    const transaction = jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          learningRule: { updateMany, findUniqueOrThrow },
          auditLog: { create: createAudit },
        }),
    );
    const service = new LearningService({
      learningRule: { findFirst: jest.fn().mockResolvedValue(rule) },
      $transaction: transaction,
    } as never);

    await expect(
      service.restore(rule.id, principal(['learning.restore'])),
    ).resolves.toEqual(restored);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]?.[0].where).toEqual({
      id: rule.id,
      tenantId: rule.tenantId,
      status: LearningRuleStatus.RETIRED,
    });
    expect(createAudit).toHaveBeenCalledTimes(1);
    expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({
      action: 'learning.rule.restored',
      before: { status: LearningRuleStatus.RETIRED },
      after: { status: LearningRuleStatus.ACTIVE },
    });
  });

  function principal(tenantPermissions: string[]): AuthPrincipal {
    return {
      userId: '00000000-0000-4000-8000-000000000003',
      tenantId: rule.tenantId,
      sessionId: '00000000-0000-4000-8000-000000000004',
      displayName: 'Administrador local',
      permissions: tenantPermissions,
      tenantPermissions,
      clientPermissions: {},
      clientIds: [],
      requestId: 'request-learning-restore',
    };
  }
});
