export function buildTitleReviewUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/revision-titulo#${encodeURIComponent(token)}`;
}
