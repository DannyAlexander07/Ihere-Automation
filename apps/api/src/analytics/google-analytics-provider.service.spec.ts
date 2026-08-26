import { ConfigService } from '@nestjs/config';
import { GoogleAnalyticsProviderService } from './google-analytics-provider.service';

describe('GoogleAnalyticsProviderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('descubre propiedades de GA4 y sitios de Search Console sin modificarlos', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accountSummaries: [
              {
                account: 'accounts/1',
                displayName: 'Cuenta Adecco',
                propertySummaries: [
                  {
                    property: 'properties/123456789',
                    displayName: 'Adecco Perú',
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            siteEntry: [
              {
                siteUrl: 'https://www.adecco.com/es-pe/',
                permissionLevel: 'siteRestrictedUser',
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const service = new GoogleAnalyticsProviderService(
      new ConfigService({ ANALYTICS_ENABLED: true }),
    );

    await expect(service.sources('access-token')).resolves.toEqual({
      ga4Properties: [
        {
          id: '123456789',
          displayName: 'Adecco Perú',
          accountName: 'Cuenta Adecco',
        },
      ],
      gscSites: [
        {
          siteUrl: 'https://www.adecco.com/es-pe/',
          permissionLevel: 'siteRestrictedUser',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBeUndefined();
      expect(init?.headers).toEqual({ authorization: 'Bearer access-token' });
    }
  });

  it('solicita y conserva el tiempo de interacción de GA4 por página', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: '20260820' }],
                metricValues: [
                  { value: '10' },
                  { value: '8' },
                  { value: '14' },
                  { value: '7' },
                  { value: '425.5' },
                  { value: '2' },
                ],
              },
            ],
            rowCount: 1,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [
                  { value: '20260820' },
                  { value: '/es-pe/blog/gestion-del-talento' },
                ],
                metricValues: [
                  { value: '4' },
                  { value: '3' },
                  { value: '6' },
                  { value: '3' },
                  { value: '180.5' },
                  { value: '1' },
                ],
              },
              {
                dimensionValues: [
                  { value: '20260820' },
                  { value: '/es-cl/blog/contenido-fuera-del-alcance' },
                ],
                metricValues: [
                  { value: '100' },
                  { value: '90' },
                  { value: '120' },
                  { value: '80' },
                  { value: '900' },
                  { value: '10' },
                ],
              },
            ],
            rowCount: 2,
          }),
          { status: 200 },
        ),
      );
    const service = new GoogleAnalyticsProviderService(
      new ConfigService({ ANALYTICS_ENABLED: true }),
    );

    const rows = await service.ga4Metrics({
      accessToken: 'access-token',
      propertyId: '123456789',
      siteUrl: 'https://www.adecco.com/es-pe/',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
    });

    expect(rows).toEqual([
      expect.objectContaining({
        pagePath: '__IHERE_TOTAL__',
        userEngagementDuration: 425.5,
        keyEvents: 2,
      }),
      expect.objectContaining({
        pagePath: '/es-pe/blog/gestion-del-talento',
        userEngagementDuration: 180.5,
        keyEvents: 1,
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const totalsBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as {
      dimensionFilter: {
        filter: {
          fieldName: string;
          stringFilter: { matchType: string; value: string };
        };
      };
    };
    expect(totalsBody.dimensionFilter).toEqual({
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'BEGINS_WITH',
          value: '/es-pe/blog',
          caseSensitive: false,
        },
      },
    });
    const detailBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ) as { dimensionFilter: unknown };
    expect(detailBody.dimensionFilter).toEqual(totalsBody.dimensionFilter);
    for (const [, init] of fetchMock.mock.calls) {
      expect(typeof init?.body).toBe('string');
      const body = JSON.parse(init?.body as string) as {
        metrics: { name: string }[];
      };
      expect(body.metrics.map((metric) => metric.name)).toContain(
        'userEngagementDuration',
      );
    }
  });

  it('limita el total de Search Console a las URLs del blog', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                keys: ['2026-08-20'],
                clicks: 12,
                impressions: 240,
                ctr: 0.05,
                position: 4,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                keys: [
                  '2026-08-20',
                  'https://www.adecco.com/es-pe/blog/empleo',
                  'empleos peru',
                ],
                clicks: 8,
                impressions: 160,
                ctr: 0.05,
                position: 3,
              },
              {
                keys: [
                  '2026-08-20',
                  'https://www.adecco.com/es-cl/blog/contenido-fuera-del-alcance',
                  'empleos chile',
                ],
                clicks: 80,
                impressions: 1_600,
                ctr: 0.05,
                position: 2,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const service = new GoogleAnalyticsProviderService(
      new ConfigService({ ANALYTICS_ENABLED: true }),
    );

    const rows = await service.gscMetrics({
      accessToken: 'access-token',
      siteUrl: 'https://www.adecco.com/es-pe/',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
    });

    expect(rows[0]).toMatchObject({
      page: '__IHERE_TOTAL__',
      query: '__IHERE_TOTAL__',
      clicks: 12,
    });
    expect(rows).toHaveLength(2);
    const totalsBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as { dimensionFilterGroups: unknown[] };
    expect(totalsBody.dimensionFilterGroups).toEqual([
      {
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: '/es-pe/blog',
          },
        ],
      },
    ]);
    const detailBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    ) as { dimensionFilterGroups: unknown[] };
    expect(detailBody.dimensionFilterGroups).toEqual(
      totalsBody.dimensionFilterGroups,
    );
  });
});
