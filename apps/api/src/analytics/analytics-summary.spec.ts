import { AnalyticsConnectionStatus } from '../generated/prisma/client';
import {
  buildAnalyticsSummary,
  buildPagePerformance,
  metricPersistenceBatches,
} from './analytics.service';

describe('buildAnalyticsSummary', () => {
  const currentStart = new Date('2026-08-01T00:00:00.000Z');
  const currentEnd = new Date('2026-08-07T00:00:00.000Z');
  const previousStart = new Date('2026-07-25T00:00:00.000Z');
  const previousEnd = new Date('2026-07-31T00:00:00.000Z');

  it('usa las filas totales para evitar duplicar usuarios entre páginas', () => {
    const summary = buildAnalyticsSummary(
      {
        status: AnalyticsConnectionStatus.CONNECTED,
        lastSyncCompletedAt: currentEnd,
        ga4PropertyId: '123456',
        gscSiteUrl: 'sc-domain:example.com',
      },
      { days: 7, currentStart, currentEnd, previousStart, previousEnd },
      [
        ga4('2026-08-01', '__IHERE_TOTAL__', 100, 80, 150),
        ga4('2026-08-01', '/blog/a', 70, 60, 100),
        ga4('2026-08-01', '/blog/b', 50, 45, 80),
        ga4('2026-07-25', '__IHERE_TOTAL__', 50, 40, 70),
      ],
      [
        gsc('2026-08-01', '__IHERE_TOTAL__', '__IHERE_TOTAL__', 30, 300, 4),
        gsc('2026-08-01', '/blog/a', 'empleo', 20, 200, 3),
        gsc('2026-07-25', '__IHERE_TOTAL__', '__IHERE_TOTAL__', 15, 200, 5),
      ],
    );

    expect(summary.metrics.sessions.current).toBe(100);
    expect(summary.metrics.activeUsers.current).toBe(80);
    expect(summary.metrics.averageEngagementTime.current).toBe(45);
    expect(summary.metrics.sessions.changePercent).toBe(100);
    expect(summary.metrics.clicks.current).toBe(30);
    expect(summary.metrics.ctr.current).toBeCloseTo(0.1);
    expect(summary.topPages[0]).toMatchObject({
      pagePath: '/blog/a',
      sessions: 70,
    });
    expect(summary.topQueries[0]).toMatchObject({
      query: 'empleo',
      clicks: 20,
    });
    expect(summary.methodology.note).toContain('no atribuyen causalidad');
  });

  it('no inventa porcentaje cuando el periodo anterior es cero', () => {
    const summary = buildAnalyticsSummary(
      null,
      { days: 7, currentStart, currentEnd, previousStart, previousEnd },
      [ga4('2026-08-01', '__IHERE_TOTAL__', 10, 8, 12)],
      [],
    );
    expect(summary.connected).toBe(false);
    expect(summary.metrics.sessions.changePercent).toBeNull();
    expect(summary.metrics.clicks.changePercent).toBe(0);
  });

  it('limita el informe editorial al blog y conserva sus totales no duplicados', () => {
    const summary = buildAnalyticsSummary(
      {
        status: AnalyticsConnectionStatus.CONNECTED,
        lastSyncCompletedAt: currentEnd,
        ga4PropertyId: '123456',
        gscSiteUrl: 'https://www.adecco.com/es-pe/',
      },
      { days: 7, currentStart, currentEnd, previousStart, previousEnd },
      [
        ga4('2026-08-01', '__IHERE_TOTAL__', 90, 70, 130),
        ga4('2026-08-01', '/es-pe/blog/a', 70, 60, 100),
        ga4('2026-08-01', '/es-pe/blog/b', 50, 45, 80),
        ga4('2026-08-01', '/es-pe/servicios', 200, 160, 300),
      ],
      [
        gsc('2026-08-01', '__IHERE_TOTAL__', '__IHERE_TOTAL__', 25, 250, 4),
        gsc('2026-08-01', '/es-pe/blog/a', 'empleo', 20, 200, 3),
        gsc('2026-08-01', '/es-pe/servicios', 'servicios', 80, 800, 2),
      ],
      'BLOG',
    );

    expect(summary.metrics.sessions.current).toBe(90);
    expect(summary.metrics.activeUsers.current).toBe(70);
    expect(summary.metrics.clicks.current).toBe(25);
    expect(summary.topPages).toEqual([
      expect.objectContaining({ pagePath: '/es-pe/blog/a' }),
      expect.objectContaining({ pagePath: '/es-pe/blog/b' }),
    ]);
    expect(summary.topQueries).toEqual([
      expect.objectContaining({ query: 'empleo' }),
    ]);
  });

  it('combina GA4 y GSC por artículo y diferencia notas de I HERE del histórico', () => {
    const pages = buildPagePerformance(
      { gscSiteUrl: 'https://www.adecco.com/es-pe/' },
      { days: 7, currentStart, currentEnd, previousStart, previousEnd },
      [
        ga4('2026-08-01', '/es-pe/blog/historico', 20, 15, 35),
        ga4('2026-08-01', '/es-pe/blog/nota-ihere', 10, 8, 18),
        ga4('2026-08-01', '/es-pe/servicios', 100, 80, 150),
      ],
      [
        gsc(
          '2026-08-01',
          'https://www.adecco.com/es-pe/blog/historico',
          'empleo peru',
          7,
          140,
          5,
        ),
        gsc(
          '2026-08-01',
          'https://www.adecco.com/es-pe/blog/nota-ihere',
          'turnos sin cobertura',
          4,
          80,
          3,
        ),
      ],
      [
        {
          noteId: 'note-1',
          url: 'https://www.adecco.com/es-pe/blog/nota-ihere',
          pagePath: '/es-pe/blog/nota-ihere',
          publishedAt: new Date('2026-07-30T00:00:00.000Z'),
          note: { versions: [{ title: 'Nota creada en I HERE' }] },
        },
      ],
    );

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      pagePath: '/es-pe/blog/historico',
      source: 'BLOG_HISTORY',
      views: 35,
      clicks: 7,
      ctr: 0.05,
      averageEngagementTimeSeconds: 45,
    });
    expect(pages[1]).toMatchObject({
      title: 'Nota creada en I HERE',
      source: 'I_HERE',
      noteId: 'note-1',
      position: 3,
    });
  });
});

describe('metricPersistenceBatches', () => {
  it('separa el rango por días sin perder ni mezclar filas', () => {
    const ga4Rows = [
      ga4('2026-01-15', '/blog/a', 1, 1, 1),
      ga4('2026-01-16', '/blog/b', 2, 2, 2),
      ga4('2026-01-17', '/blog/c', 3, 3, 3),
    ];
    const gscRows = [
      gsc('2026-01-15', '/blog/a', 'uno', 1, 10, 1),
      gsc('2026-01-17', '/blog/c', 'tres', 2, 20, 2),
    ];

    const batches = metricPersistenceBatches(
      new Date('2026-01-15T00:00:00.000Z'),
      new Date('2026-01-17T00:00:00.000Z'),
      ga4Rows,
      gscRows,
    );

    expect(batches).toHaveLength(3);
    expect(
      batches.map((batch) => batch.start.toISOString().slice(0, 10)),
    ).toEqual(['2026-01-15', '2026-01-16', '2026-01-17']);
    expect(
      batches.map((batch) => batch.end.toISOString().slice(0, 10)),
    ).toEqual(['2026-01-15', '2026-01-16', '2026-01-17']);
    expect(batches.map((batch) => batch.ga4Rows.length)).toEqual([1, 1, 1]);
    expect(batches.map((batch) => batch.gscRows.length)).toEqual([1, 0, 1]);
  });
});

function ga4(
  date: string,
  pagePath: string,
  sessions: number,
  activeUsers: number,
  views: number,
) {
  return {
    date: new Date(`${date}T00:00:00.000Z`),
    pagePath,
    sessions,
    activeUsers,
    views,
    engagedSessions: sessions / 2,
    userEngagementDuration: sessions * 45,
    keyEvents: sessions / 10,
  };
}

function gsc(
  date: string,
  page: string,
  query: string,
  clicks: number,
  impressions: number,
  position: number,
) {
  return {
    date: new Date(`${date}T00:00:00.000Z`),
    page,
    query,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
  };
}
