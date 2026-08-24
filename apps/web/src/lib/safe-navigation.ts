const internalOrigin = 'https://ihere.internal';

export function safeInternalPath(
  value: string | string[] | undefined,
  fallback = '/inicio',
): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('\\') ||
    /%(?:2f|5c)/i.test(value)
  ) {
    return fallback;
  }
  try {
    const url = new URL(value, internalOrigin);
    if (
      url.origin !== internalOrigin ||
      !url.pathname.startsWith('/') ||
      url.pathname.startsWith('//') ||
      url.pathname.includes('\\')
    ) {
      return fallback;
    }
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return new URL(normalized, internalOrigin).origin === internalOrigin
      ? normalized
      : fallback;
  } catch {
    return fallback;
  }
}
