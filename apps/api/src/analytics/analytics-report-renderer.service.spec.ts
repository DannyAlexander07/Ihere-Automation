import {
  AnalyticsReportRendererService,
  buildAnalyticsReportView,
} from './analytics-report-renderer.service';

describe('AnalyticsReportRendererService', () => {
  const renderer = new AnalyticsReportRendererService();
  const report = {
    clientName: 'Adecco Perú',
    generatedAt: new Date('2026-09-10T12:00:00Z'),
    lastSyncCompletedAt: '2026-09-10T10:00:00Z',
    period: {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      comparisonStartDate: '2026-07-01',
      comparisonEndDate: '2026-07-31',
    },
    metrics: {
      views: { current: 1200, previous: 1000, changePercent: 20 },
      clicks: { current: 90, previous: 75, changePercent: 20 },
      impressions: { current: 4000, previous: 3500, changePercent: 14.29 },
      ctr: { current: 0.0225, previous: 0.0214, changePercent: 5.14 },
    },
    monthly: [
      {
        month: '2026-08',
        sessions: 900,
        views: 1200,
        clicks: 90,
        impressions: 4000,
        ctr: 0.0225,
        position: 9.4,
      },
    ],
    pagePerformance: [
      {
        title: 'Nota de ejemplo',
        url: 'https://www.adecco.com/es-pe/blog/nota',
        source: 'I_HERE',
        views: 300,
        sessions: 220,
        clicks: 25,
        impressions: 900,
        ctr: 0.0278,
        position: 8.2,
        engagementRate: 0.64,
        keyEvents: 3,
      },
    ],
    recommendations: [
      {
        title: 'Mejorar CTR',
        detail: 'Revisar title y meta description.',
        priority: 'ALTA',
        status: 'OPEN',
        observationCount: 2,
        targetUrl: 'https://www.adecco.com/es-pe/blog/nota',
        implementationNote: null,
      },
    ],
    actionPlan: [
      {
        id: 'editorial' as const,
        front: 'Estándar editorial y optimización de contenidos',
        priority: 'ALTA' as const,
        status: 'PENDING' as const,
        moodOwner: 'Mood · SEO y Contenidos',
        moodAction: 'Ajustar la nota prioritaria.',
        clientOwner: 'Marketing/Contenido del cliente',
        clientAction: 'Revisar y aprobar el ajuste.',
        dependency: 'Aprobación del contenido.',
        dueDate: '2026-09-14',
        evidence: '1 señal sustentada en GA4 y GSC.',
        validation: 'Comparar el siguiente periodo.',
        recommendationCount: 1,
        repeatedCount: 1,
      },
    ],
    methodology: {
      note: 'Alcance: URLs del blog.',
      ga4: 'Consumo medido por GA4.',
      gsc: 'Visibilidad medida por Search Console.',
    },
  };

  it.each(['DOCX', 'PDF'] as const)(
    'genera un informe %s válido',
    async (format) => {
      const rendered = await renderer.render(report, format);
      expect(rendered.buffer.byteLength).toBeGreaterThan(2_000);
      expect(
        format === 'DOCX'
          ? rendered.buffer.subarray(0, 2).toString('ascii')
          : rendered.buffer.subarray(0, 5).toString('ascii'),
      ).toBe(format === 'DOCX' ? 'PK' : '%PDF-');
    },
  );

  it('exporta solo las diez notas principales y excluye la portada del blog', () => {
    const page = report.pagePerformance[0];
    const pages = [
      {
        ...page,
        title: 'Blog',
        url: 'https://www.adecco.com/es-pe/blog',
        views: 999,
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        ...page,
        title: `Nota ${index + 1}`,
        url: `https://www.adecco.com/es-pe/blog/nota-${index + 1}`,
        views: index + 1,
      })),
    ];

    const view = buildAnalyticsReportView({ pagePerformance: pages });

    expect(view.topPages).toHaveLength(10);
    expect(view.topPages[0].title).toBe('Nota 12');
    expect(view.topPages.some((item) => item.title === 'Blog')).toBe(false);
  });
});
