export type EditorialGlossaryEntry = {
  preferredTerm: string;
  variants: string[];
  guidance?: string;
};

export type EditorialGlossary = { entries: EditorialGlossaryEntry[] };

export type GlossaryFinding = {
  preferredTerm: string;
  matchedVariant: string;
  guidance: string | null;
};

export function parseEditorialGlossaries(
  values: unknown[],
): EditorialGlossaryEntry[] {
  const entries = values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const rawEntries = (value as { entries?: unknown }).entries;
    if (!Array.isArray(rawEntries)) return [];
    return rawEntries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      if (
        typeof record.preferredTerm !== 'string' ||
        !Array.isArray(record.variants)
      ) {
        return [];
      }
      const variants = record.variants.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length >= 2,
      );
      return variants.length
        ? [
            {
              preferredTerm: record.preferredTerm.trim(),
              variants: [...new Set(variants.map((item) => item.trim()))],
              guidance:
                typeof record.guidance === 'string'
                  ? record.guidance.trim()
                  : undefined,
            },
          ]
        : [];
    });
  });
  return entries;
}

export function evaluateEditorialGlossary(
  text: string,
  entries: EditorialGlossaryEntry[],
): GlossaryFinding[] {
  const normalizedText = normalize(text);
  return entries.flatMap((entry) => {
    const preferred = normalize(entry.preferredTerm);
    return entry.variants.flatMap((variant) => {
      const normalizedVariant = normalize(variant);
      if (!normalizedVariant || normalizedVariant === preferred) return [];
      const pattern = new RegExp(
        `(?:^|\\s)${escapeRegExp(normalizedVariant)}(?=$|\\s)`,
        'u',
      );
      return pattern.test(normalizedText)
        ? [
            {
              preferredTerm: entry.preferredTerm,
              matchedVariant: variant,
              guidance: entry.guidance ?? null,
            },
          ]
        : [];
    });
  });
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
