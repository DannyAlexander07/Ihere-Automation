export const ADECCO_CONTACT_URL =
  "https://www.adecco.com/es-pe/contactanos";

export function editorialCtaActionLabel(url: string | null | undefined) {
  return normalizeUrl(url) === ADECCO_CONTACT_URL
    ? "Contacta a un especialista"
    : "Abrir información relacionada";
}

function normalizeUrl(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/u, "") ?? "";
}
