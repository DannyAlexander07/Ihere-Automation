import type { ContentPublication } from "./types";

export type PublicationCandidateGroup = {
  key: string;
  publications: ContentPublication[];
  recommended: ContentPublication;
};

const validationRank: Record<ContentPublication["validationStatus"], number> = {
  VALID: 6,
  REDIRECTED: 5,
  REVIEW: 4,
  PENDING: 3,
  ERROR: 2,
  BROKEN: 1,
};

export function publicationCandidateGroups(
  publications: ContentPublication[],
): PublicationCandidateGroup[] {
  const groups = new Map<string, ContentPublication[]>();
  for (const publication of publications) {
    const key = publication.candidateGroupKey ?? publication.id;
    groups.set(key, [...(groups.get(key) ?? []), publication]);
  }
  return [...groups.entries()]
    .map(([key, grouped]) => ({
      key,
      publications: grouped.toSorted(compareCandidates),
      recommended: grouped.toSorted(compareCandidates)[0],
    }))
    .toSorted(
      (left, right) =>
        new Date(right.recommended.publishedAt).getTime() -
        new Date(left.recommended.publishedAt).getTime(),
    );
}

export function recommendedPublicationUrl(
  publication: ContentPublication,
): string {
  if (publication.canonicalUrl && isBlogArticle(publication.canonicalUrl)) {
    return publication.canonicalUrl;
  }
  if (publication.resolvedUrl && isBlogArticle(publication.resolvedUrl)) {
    return publication.resolvedUrl;
  }
  return publication.url;
}

function compareCandidates(
  left: ContentPublication,
  right: ContentPublication,
): number {
  const rank =
    validationRank[right.validationStatus] -
    validationRank[left.validationStatus];
  if (rank) return rank;
  const selfCanonical =
    Number(isSelfCanonical(right)) - Number(isSelfCanonical(left));
  if (selfCanonical) return selfCanonical;
  const status =
    Number(right.httpStatus === 200) - Number(left.httpStatus === 200);
  if (status) return status;
  return right.url.length - left.url.length;
}

function isSelfCanonical(publication: ContentPublication): boolean {
  return Boolean(
    publication.canonicalUrl &&
    comparableUrl(publication.canonicalUrl) ===
      comparableUrl(publication.resolvedUrl ?? publication.url),
  );
}

function isBlogArticle(value: string): boolean {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean);
    const blogIndex = segments.indexOf("blog");
    return blogIndex >= 0 && Boolean(segments[blogIndex + 1]);
  } catch {
    return false;
  }
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value);
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // Conserva el valor observado cuando contiene escapes heredados.
    }
    return `${url.hostname.toLowerCase()}${pathname.replace(/\/+$/, "").toLocaleLowerCase("es-PE")}`;
  } catch {
    return value.trim().toLocaleLowerCase("es-PE");
  }
}
