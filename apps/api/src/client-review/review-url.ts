export function buildReviewUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/revision#${encodeURIComponent(token)}`;
}
