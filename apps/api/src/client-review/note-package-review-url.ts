export function buildNotePackageReviewUrl(
  baseUrl: string,
  token: string,
): string {
  return `${baseUrl.replace(/\/$/, '')}/revision-paquete-notas#${encodeURIComponent(token)}`;
}
