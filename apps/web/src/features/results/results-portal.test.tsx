import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultsPortal } from "./results-portal";
import type { PublicResults } from "./types";

describe("ResultsPortal", () => {
  it("muestra datos reales, el periodo y la advertencia metodológica", () => {
    render(<ResultsPortal data={fixture()} />);
    expect(
      screen.getByRole("heading", {
        name: "Resultados digitales de Adecco Perú",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("empleos peru")).toBeInTheDocument();
    expect(screen.getAllByText("Artículo histórico del blog").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45 s").length).toBeGreaterThan(0);
    expect(screen.getByText(/no atribuyen causalidad/i)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /tendencia de sesiones y clics/i }),
    ).toBeInTheDocument();
  });
});

function fixture(): PublicResults {
  const comparison = (current: number) => ({
    current,
    previous: current / 2,
    changePercent: 100,
    favorable: true,
  });
  return {
    client: { name: "Adecco Perú", slug: "adecco-peru" },
    recipientName: "Equipo Adecco",
    expiresAt: "2026-09-15T00:00:00.000Z",
    summary: {
      connected: true,
      configured: { ga4: true, gsc: true },
      lastSyncCompletedAt: "2026-08-16T10:00:00.000Z",
      period: {
        days: 28,
        startDate: "2026-07-19",
        endDate: "2026-08-15",
        comparisonStartDate: "2026-06-21",
        comparisonEndDate: "2026-07-18",
      },
      metrics: {
        sessions: comparison(1250),
        activeUsers: comparison(900),
        views: comparison(1800),
        engagedSessions: comparison(720),
        averageEngagementTime: comparison(45),
        keyEvents: comparison(40),
        clicks: comparison(320),
        impressions: comparison(12000),
        ctr: comparison(0.0267),
        averagePosition: { ...comparison(7.2), favorable: false },
      },
      daily: [
        { date: "2026-08-14", sessions: 42, clicks: 8, impressions: 320 },
        { date: "2026-08-15", sessions: 55, clicks: 11, impressions: 410 },
      ],
      monthly: [
        {
          month: "2026-08",
          sessions: 97,
          views: 145,
          clicks: 19,
          impressions: 730,
          ctr: 19 / 730,
          position: 6.2,
        },
      ],
      topPages: [{ pagePath: "/blog/empleo", sessions: 450, views: 680 }],
      topQueries: [
        {
          query: "empleos peru",
          clicks: 120,
          impressions: 2800,
          ctr: 0.043,
          position: 4.5,
        },
      ],
      pagePerformance: [
        {
          pagePath: "/es-pe/blog/articulo-historico",
          url: "https://www.adecco.com/es-pe/blog/articulo-historico",
          title: "Artículo histórico del blog",
          source: "BLOG_HISTORY",
          noteId: null,
          publishedAt: null,
          sessions: 120,
          activeUsers: 90,
          views: 180,
          engagedSessions: 72,
          engagementRate: 0.6,
          averageEngagementTimeSeconds: 45,
          keyEvents: 4,
          clicks: 25,
          impressions: 800,
          ctr: 0.03125,
          position: 6.2,
          topQueries: [
            { query: "empleo formal", clicks: 10, impressions: 300 },
          ],
        },
      ],
      publicationPerformance: [],
      methodology: {
        note: "Las variaciones muestran correlación; no atribuyen causalidad a automatización, SEO ni GEO.",
        ga4: "Datos de GA4.",
        gsc: "Datos de Search Console.",
      },
    },
  };
}
