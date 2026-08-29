import { describe, expect, it } from "vitest";
import {
  publicationCandidateGroups,
  recommendedPublicationUrl,
} from "./publication-candidate-groups";
import type { ContentPublication } from "./types";

describe("publicationCandidateGroups", () => {
  it("agrupa variantes y recomienda la URL validada", () => {
    const broken = publication({
      id: "broken",
      url: "https://www.adecco.com/es-pe/blog/articulo-cortado",
      validationStatus: "BROKEN",
      candidateGroupKey: "group-1",
      httpStatus: 404,
    });
    const valid = publication({
      id: "valid",
      url: "https://www.adecco.com/es-pe/blog/articulo-completo",
      canonicalUrl: "https://www.adecco.com/es-pe/blog/articulo-completo",
      resolvedUrl: "https://www.adecco.com/es-pe/blog/articulo-completo",
      validationStatus: "VALID",
      candidateGroupKey: "group-1",
      httpStatus: 200,
    });

    const groups = publicationCandidateGroups([broken, valid]);

    expect(groups).toHaveLength(1);
    expect(groups[0].recommended.id).toBe("valid");
    expect(groups[0].publications).toHaveLength(2);
    expect(recommendedPublicationUrl(groups[0].recommended)).toBe(
      valid.canonicalUrl,
    );
  });
});

function publication(
  override: Partial<ContentPublication>,
): ContentPublication {
  return {
    id: "publication",
    clientId: "client",
    noteId: null,
    title: "Artículo",
    url: "https://www.adecco.com/es-pe/blog/articulo",
    pagePath: "/es-pe/blog/articulo",
    publishedAt: "2026-08-20T00:00:00.000Z",
    source: "AUTO_DETECTED",
    status: "PENDING_CONFIRMATION",
    validationStatus: "PENDING",
    httpStatus: null,
    resolvedUrl: null,
    canonicalUrl: null,
    redirectCount: 0,
    validationMessage: null,
    validationCheckedAt: null,
    candidateGroupKey: null,
    confirmedAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    note: null,
    ...override,
  };
}
