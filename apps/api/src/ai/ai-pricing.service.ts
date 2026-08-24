import { Injectable } from '@nestjs/common';

type ModelPricing = {
  inputMicrosPerMillion: number;
  cachedInputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
};

const pricing: Record<string, ModelPricing> = {
  'gpt-5.6-sol': {
    inputMicrosPerMillion: 5_000_000,
    cachedInputMicrosPerMillion: 500_000,
    outputMicrosPerMillion: 30_000_000,
  },
  'gpt-5.6-terra': {
    inputMicrosPerMillion: 2_500_000,
    cachedInputMicrosPerMillion: 250_000,
    outputMicrosPerMillion: 15_000_000,
  },
  'gpt-5.6-luna': {
    inputMicrosPerMillion: 1_000_000,
    cachedInputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 6_000_000,
  },
};

export const AI_PRICING_VERSION = 'openai-public-2026-08-16-conservative-v1';

export type AiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

@Injectable()
export class AiPricingService {
  calculateMicros(model: string, usage: AiUsage): number {
    const rates = pricing[model];
    if (!rates)
      throw new Error(`No existe una tarifa registrada para ${model}.`);
    const uncachedInput = Math.max(
      0,
      usage.inputTokens - usage.cachedInputTokens,
    );
    const tokenCost =
      (uncachedInput * rates.inputMicrosPerMillion +
        usage.cachedInputTokens * rates.cachedInputMicrosPerMillion +
        usage.outputTokens * rates.outputMicrosPerMillion) /
      1_000_000;

    // La tarifa de herramientas puede cambiar. Se reserva un costo conservador
    // de USD 0.025 por búsqueda y se registra por separado para recalibrarlo.
    const searchCost = Math.max(0, usage.webSearchCalls) * 25_000;
    return Math.ceil(tokenCost + searchCost);
  }
}
