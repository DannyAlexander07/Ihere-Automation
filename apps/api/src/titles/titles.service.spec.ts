import type { AuthPrincipal } from '../common/auth/auth-principal';
import { TitlesService } from './titles.service';

describe('TitlesService', () => {
  it('incluye oportunidad y riesgo en el listado revisable', async () => {
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
    expect(input.select).toMatchObject({ opportunity: true, risk: true });
  });
});
