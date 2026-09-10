import { buildCandidates } from './analytics-recommendations.service';

describe('buildCandidates', () => {
  it('detecta oportunidades por nota y alertas de URL sin mezclar el sitio completo', () => {
    const candidates = buildCandidates(
      [
        {
          pagePath: '/es-pe/blog/nota-prueba',
          url: 'https://www.adecco.com/es-pe/blog/nota-prueba',
          title: 'Nota de prueba',
          sessions: 40,
          engagementRate: 0.25,
          keyEvents: 0,
          clicks: 1,
          impressions: 250,
          ctr: 0.004,
          position: 11,
        },
      ],
      [
        {
          id: 'publication-1',
          title: 'Nota publicada',
          url: 'https://www.adecco.com/es-pe/blog/url-antigua',
          validationStatus: 'REDIRECTED',
          validationMessage: 'La URL redirige a otra dirección.',
        },
      ],
    );

    expect(candidates.map((item) => item.code)).toEqual([
      'PUBLICATION_URL',
      'LOW_CTR',
      'LOW_ENGAGEMENT',
      'NO_KEY_EVENTS',
      'NEAR_PAGE_ONE',
    ]);
    expect(new Set(candidates.map((item) => item.fingerprint)).size).toBe(5);
  });
});
