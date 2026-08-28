import { describe, expect, it } from "vitest";
import { buildArticleInsight, publicationMonthKey } from "./article-insights";
import type { PublicationPerformance } from "./types";

function publication(
  overrides: Partial<PublicationPerformance["milestones"][number]["ga4"]> = {},
  gsc: Partial<PublicationPerformance["milestones"][number]["gsc"]> = {},
): PublicationPerformance {
  return {
    id: "publication-1",
    clientId: "client-1",
    noteId: "note-1",
    title: "Nota",
    url: "https://example.com/nota",
    pagePath: "/nota",
    publishedAt: "2026-08-12T00:00:00.000Z",
    source: "MANUAL",
    status: "CONFIRMED",
    confirmedAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    note: { currentVersion: 1, versions: [{ title: "Nota", slug: "nota" }] },
    milestones: [
      {
        days: 30,
        status: "COMPLETE",
        throughDate: "2026-09-11",
        ga4: {
          sessions: 30,
          activeUsers: 20,
          views: 40,
          engagedSessions: 20,
          keyEvents: 2,
          ...overrides,
        },
        gsc: { clicks: 10, impressions: 300, ctr: 0.033, position: 8, ...gsc },
      },
    ],
  };
}

describe("article insights", () => {
  it("detecta una oportunidad de CTR con impresiones suficientes", () => {
    expect(
      buildArticleInsight(publication({}, { impressions: 300, ctr: 0.01 }))
        .title,
    ).toContain("CTR");
  });

  it("no inventa conclusiones cuando no hay datos", () => {
    expect(
      buildArticleInsight(publication({ sessions: 0 }, { impressions: 0 }))
        .tone,
    ).toBe("learning");
  });

  it("agrupa publicaciones por mes ISO", () => {
    expect(publicationMonthKey("2026-08-12T00:00:00.000Z")).toBe("2026-08");
  });
});
