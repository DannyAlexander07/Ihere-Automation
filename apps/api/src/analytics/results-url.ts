export function buildResultsUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/resultados#${encodeURIComponent(token)}`;
}
