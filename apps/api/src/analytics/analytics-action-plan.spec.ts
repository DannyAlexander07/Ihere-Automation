import { buildAnalyticsActionPlan } from './analytics-action-plan';

describe('buildAnalyticsActionPlan', () => {
  const recommendation = (
    code: string,
    status: 'OPEN' | 'IMPLEMENTED' | 'DISMISSED' = 'OPEN',
    observationCount = 1,
  ) => ({
    id: `${code}-${status}-${observationCount}`,
    code,
    priority: code === 'LOW_CTR' ? ('ALTA' as const) : ('MEDIA' as const),
    status,
    observationCount,
    implementationNote: null,
    targetUrl: 'https://example.com/blog/nota',
  });

  it('agrupa las recomendaciones en responsables y fechas concretas', () => {
    const plan = buildAnalyticsActionPlan(
      [
        recommendation('NO_KEY_EVENTS', 'OPEN', 2),
        recommendation('LOW_CTR'),
        recommendation('LOW_ENGAGEMENT'),
        recommendation('PUBLICATION_URL'),
      ],
      '2026-08-31',
    );

    expect(plan.map((item) => item.id)).toEqual([
      'measurement',
      'editorial',
      'technical',
    ]);
    expect(plan[0]).toMatchObject({
      dueDate: '2026-09-07',
      repeatedCount: 1,
      status: 'PENDING',
      moodOwner: 'Mood · Analítica',
      clientOwner: 'Tecnología/Web del cliente',
    });
    expect(plan[1]).toMatchObject({
      dueDate: '2026-09-14',
      recommendationCount: 2,
      priority: 'ALTA',
    });
    expect(plan[2].dueDate).toBe('2026-09-15');
  });

  it('distingue planes en progreso, validados y descartados', () => {
    expect(
      buildAnalyticsActionPlan(
        [
          recommendation('LOW_CTR', 'OPEN'),
          recommendation('LOW_ENGAGEMENT', 'IMPLEMENTED'),
        ],
        '2026-08-31',
      )[0].status,
    ).toBe('IN_PROGRESS');
    expect(
      buildAnalyticsActionPlan(
        [recommendation('NO_KEY_EVENTS', 'IMPLEMENTED')],
        '2026-08-31',
      )[0].status,
    ).toBe('VALIDATED');
    expect(
      buildAnalyticsActionPlan(
        [recommendation('PUBLICATION_URL', 'DISMISSED')],
        '2026-08-31',
      )[0].status,
    ).toBe('DISMISSED');
  });

  it('no inventa acciones cuando no existen hallazgos', () => {
    expect(buildAnalyticsActionPlan([], '2026-08-31')).toEqual([]);
  });
});
