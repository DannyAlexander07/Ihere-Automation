export const ADECCO_CLIENT_SLUG = 'adecco-peru';
export const ADECCO_CONTACT_URL = 'https://www.adecco.com/es-pe/contactanos';
export const ADECCO_DEFAULT_CTA_TEXT =
  '¿Quieres evaluar la mejor alternativa para tu organización? Contacta a un especialista de Adecco.';

type EditorialCta = {
  ctaText: string | null | undefined;
  ctaUrl: string | null | undefined;
};

export function resolveEditorialCta(
  clientSlug: string,
  cta: EditorialCta,
): { ctaText: string | null; ctaUrl: string | null } {
  if (clientSlug !== ADECCO_CLIENT_SLUG) {
    return {
      ctaText: cta.ctaText?.trim() || null,
      ctaUrl: cta.ctaUrl?.trim() || null,
    };
  }

  const currentText = cta.ctaText?.trim();
  const contextualContactText = currentText
    ? `${currentText.replace(/[.!?]+$/u, '')}. Contacta a un especialista de Adecco.`
    : null;
  const contactText =
    currentText &&
    /\bcontacta\b/i.test(currentText) &&
    /\bespecialista\b/i.test(currentText)
      ? currentText
      : contextualContactText && contextualContactText.length <= 300
        ? contextualContactText
        : ADECCO_DEFAULT_CTA_TEXT;

  return {
    ctaText: contactText,
    ctaUrl: ADECCO_CONTACT_URL,
  };
}

export function isAdeccoSpecialistCta(clientSlug: string, cta: EditorialCta) {
  if (clientSlug !== ADECCO_CLIENT_SLUG) return true;
  const text = cta.ctaText?.trim() ?? '';
  return (
    cta.ctaUrl?.trim() === ADECCO_CONTACT_URL &&
    /\bcontacta\b/i.test(text) &&
    /\bespecialista\b/i.test(text)
  );
}

export function editorialCtaActionLabel(ctaUrl: string | null | undefined) {
  return ctaUrl?.trim().replace(/\/+$/u, '') === ADECCO_CONTACT_URL
    ? 'Contacta a un especialista'
    : 'Conocer más';
}
