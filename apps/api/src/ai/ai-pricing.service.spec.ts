import { AiPricingService } from './ai-pricing.service';

describe('AiPricingService', () => {
  const service = new AiPricingService();

  it('calcula Terra separando entrada cacheada y salida', () => {
    expect(
      service.calculateMicros('gpt-5.6-terra', {
        inputTokens: 1_000,
        cachedInputTokens: 400,
        outputTokens: 500,
        webSearchCalls: 0,
      }),
    ).toBe(9_100);
  });

  it('reserva el costo conservador de cada búsqueda web', () => {
    expect(
      service.calculateMicros('gpt-5.6-luna', {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        webSearchCalls: 2,
      }),
    ).toBe(50_000);
  });

  it('rechaza modelos sin tarifa para no subestimar costos', () => {
    expect(() =>
      service.calculateMicros('modelo-no-registrado', {
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 1,
        webSearchCalls: 0,
      }),
    ).toThrow('tarifa registrada');
  });
});
