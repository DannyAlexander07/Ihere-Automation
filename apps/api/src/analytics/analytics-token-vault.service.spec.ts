import { ConfigService } from '@nestjs/config';
import { AnalyticsTokenVaultService } from './analytics-token-vault.service';

describe('AnalyticsTokenVaultService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const service = new AnalyticsTokenVaultService(
    new ConfigService({ ANALYTICS_TOKEN_ENCRYPTION_KEY: key }),
  );

  it('cifra con nonce aleatorio y recupera el valor original', () => {
    const first = service.encrypt('refresh-token-confidencial');
    const second = service.encrypt('refresh-token-confidencial');
    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('refresh-token-confidencial');
    expect(service.decrypt(second)).toBe('refresh-token-confidencial');
  });

  it('rechaza un sobre alterado', () => {
    const envelope = service.encrypt('refresh-token');
    expect(() => service.decrypt(`${envelope}x`)).toThrow();
  });
});
