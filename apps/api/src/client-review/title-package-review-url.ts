export function buildTitlePackageReviewUrl(
  baseUrl: string,
  token: string,
): string {
  return `${baseUrl.replace(/\/$/, '')}/revision-paquete-titulos#${encodeURIComponent(token)}`;
}
