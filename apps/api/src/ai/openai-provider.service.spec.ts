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

  it('corta una solicitud que no responde cuando vence el plazo global', async () => {
    jest.useFakeTimers();
    try {
      const config = new ConfigService({
        AI_GENERATION_ENABLED: true,
        OPENAI_API_KEY: 'sk-test-only-not-a-real-key',
        AI_PRIMARY_MODEL: 'gpt-5.6-terra',
        AI_REASONING_EFFORT: 'medium',
        AI_MAX_OUTPUT_TOKENS: 1_000,
      });
      const service = new OpenAiProviderService(config);
      const parse = jest.fn(() => new Promise<never>(() => undefined));
      (
        service as unknown as {
          client: { responses: { parse: typeof parse } };
        }
      ).client = { responses: { parse } };

      const result = expect(
        service.structured({
          schema: z.object({ ok: z.boolean() }),
          schemaName: 'timeout_test',
          system: 'Prueba',
          user: 'Prueba',
          runId: 'run',
          stage: 'stage',
          tenantId: 'tenant',
          userId: 'user',
          deadline: Date.now() + 1_000,
        }),
      ).rejects.toThrow('La generación excedió su plazo.');
      await jest.advanceTimersByTimeAsync(1_000);

      await result;
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
