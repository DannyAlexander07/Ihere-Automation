const TRACKING_PARAMETERS = new Set([
  '_ga',
  'dclid',
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'srsltid',
  'wbraid',
]);

export function stripTrackingParameters(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return value;

    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith('utm_') ||
        TRACKING_PARAMETERS.has(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

export function stripTrackedUrlsFromText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>{}"']+/gi, (match) => {
    const trailing = match.match(/[),.;:!?]+$/)?.[0] ?? '';
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    return `${stripTrackingParameters(candidate)}${trailing}`;
  });
}

function stripTrackedUrlsFromUnknown(value: unknown): unknown {
  if (typeof value === 'string') return stripTrackedUrlsFromText(value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => stripTrackedUrlsFromUnknown(item));
  }
  if (value && typeof value === 'object') {
    if (
      value instanceof Date ||
      value instanceof URL ||
      ArrayBuffer.isView(value)
    ) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        stripTrackedUrlsFromUnknown(item),
      ]),
    );
  }
  return value;
}

export function stripTrackedUrlsFromValue<T>(value: T): T {
  return stripTrackedUrlsFromUnknown(value) as T;
}
