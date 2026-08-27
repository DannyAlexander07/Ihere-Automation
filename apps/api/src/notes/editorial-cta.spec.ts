import {
  ADECCO_CONTACT_URL,
  ADECCO_DEFAULT_CTA_TEXT,
  isAdeccoSpecialistCta,
  resolveEditorialCta,
} from './editorial-cta';

describe('editorial CTA rules', () => {
  it('aplica el contacto oficial cuando la nota es de Adecco', () => {
    expect(
      resolveEditorialCta('adecco-peru', {
        ctaText: null,
        ctaUrl: 'https://example.com',
      }),
    ).toEqual({
      ctaText: ADECCO_DEFAULT_CTA_TEXT,
      ctaUrl: ADECCO_CONTACT_URL,
    });
  });

  it('conserva el contexto y agrega la invitación al especialista', () => {
    const result = resolveEditorialCta('adecco-peru', {
      ctaText: 'Conoce cómo Adecco Payroll puede acompañar a tu empresa.',
      ctaUrl: null,
    });

    expect(result.ctaText).toBe(
      'Conoce cómo Adecco Payroll puede acompañar a tu empresa. Contacta a un especialista de Adecco.',
    );
    expect(isAdeccoSpecialistCta('adecco-peru', result)).toBe(true);
  });

  it('no impone la regla de Adecco a otros clientes', () => {
    expect(
      resolveEditorialCta('otro-cliente', {
        ctaText: 'Conoce el servicio.',
        ctaUrl: 'https://example.com/servicio',
      }),
    ).toEqual({
      ctaText: 'Conoce el servicio.',
      ctaUrl: 'https://example.com/servicio',
    });
  });
});
