import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { OpenAiProviderService } from './openai-provider.service';

describe('OpenAiProviderService', () => {
  it('no intenta llamar la API cuando la generación está deshabilitada', async () => {
    const config = new ConfigService({
      AI_GENERATION_ENABLED: false,
      AI_PRIMARY_MODEL: 'gpt-5.6-terra',
      AI_REASONING_EFFORT: 'medium',
    });
    const service = new OpenAiProviderService(config);

    await expect(
      service.structured({
        schema: z.object({ ok: z.boolean() }),
        schemaName: 'disabled_test',
        system: 'Prueba',
        user: 'Prueba',
        runId: 'run',
        stage: 'stage',
        tenantId: 'tenant',
        userId: 'user',
        deadline: Date.now() + 1_000,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
