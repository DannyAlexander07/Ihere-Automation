import { z } from 'zod';
import type { ConfigService } from '@nestjs/config';
import { AiGenerationProcessorService } from './ai-generation-processor.service';
import { AiPricingService } from './ai-pricing.service';
import type { OpenAiProviderService } from './openai-provider.service';
import type { PrismaService } from '../database/prisma.service';
import type { NoteContentService } from '../notes/note-content.service';
import { AgentType } from '../generated/prisma/client';

describe('AiGenerationProcessorService budget reservation', () => {
  it('no llama al proveedor si el máximo real de salida supera el saldo', async () => {
    const structured = jest.fn();
    const updateRun: jest.MockedFunction<
      (input: {
        where: { id: string };
        data: { status: string; errorCode: string };
      }) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      aiAgentResult: { findUnique: jest.fn().mockResolvedValue(null) },
      aiGenerationRun: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ costMicros: 0n }),
        update: updateRun,
      },
    } as unknown as PrismaService;
    const provider = {
      primaryModel: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      structured,
    } as unknown as OpenAiProviderService;
    const processor = new AiGenerationProcessorService(
      prisma,
      provider,
      new AiPricingService(),
      {} as ConfigService,
      {} as NoteContentService,
    );
    const stage = processor as unknown as {
      stage<T>(input: {
        run: {
          id: string;
          tenantId: string;
          requestedById: string;
          budgetLimitMicros: bigint;
        };
        deadline: number;
        sequence: number;
        agentType: AgentType;
        stage: string;
        schema: z.ZodType<T>;
        schemaName: string;
        system: string;
        user: string;
        maxOutputTokens: number;
      }): Promise<T>;
    };

    await expect(
      stage.stage({
        run: {
          id: 'run-budget-test',
          tenantId: 'tenant-budget-test',
          requestedById: 'user-budget-test',
          budgetLimitMicros: 100_000n,
        },
        deadline: Date.now() + 10_000,
        sequence: 1,
        agentType: AgentType.BRAND_EDITOR,
        stage: 'budget-test',
        schema: z.object({ result: z.string() }),
        schemaName: 'budget_test',
        system: 'Sistema de prueba.',
        user: 'Entrada de prueba.',
        maxOutputTokens: 10_000,
      }),
    ).rejects.toThrow('presupuesto');
    expect(structured).not.toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(updateRun.mock.calls[0]?.[0].data.status).toBe('BUDGET_BLOCKED');
    expect(updateRun.mock.calls[0]?.[0].data.errorCode).toBe(
      'RUN_BUDGET_RESERVATION_FAILED',
    );
  });
});
