import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticlePerformanceReport } from "./article-performance-report";
import type { PagePerformance } from "./types";

describe("ArticlePerformanceReport", () => {
  it("muestra métricas por artículo, filtra por origen y pagina sin alargar la vista", () => {
    render(<ArticlePerformanceReport items={items()} />);

    expect(screen.getAllByText("Artículo 1").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Artículo 9")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(screen.getAllByText("Artículo 9").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Filtrar origen del artículo"), {
      target: { value: "I_HERE" },
    });
    expect(screen.getAllByText("Nota creada en I HERE").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Artículo 1")).toHaveLength(0);
  });
});

function items(): PagePerformance[] {
  const base = Array.from({ length: 9 }, (_, index) =>
    item(index + 1, "BLOG_HISTORY", `Artículo ${index + 1}`),
  );
  return [...base, item(10, "I_HERE", "Nota creada en I HERE")];
}

function item(
  index: number,
  source: PagePerformance["source"],
  title: string,
): PagePerformance {
  return {
    pagePath: `/es-pe/blog/articulo-${index}`,
    url: `https://www.adecco.com/es-pe/blog/articulo-${index}`,
    title,
    source,
    noteId: source === "I_HERE" ? `note-${index}` : null,
    publishedAt: null,
    sessions: 20,
    activeUsers: 15,
    views: 30,
    engagedSessions: 12,
    engagementRate: 0.6,
    averageEngagementTimeSeconds: 75,
    keyEvents: 2,
    clicks: 4,
    impressions: 100,
    ctr: 0.04,
    position: 5.2,
    topQueries: [{ query: `consulta ${index}`, clicks: 4, impressions: 100 }],
  };
}
