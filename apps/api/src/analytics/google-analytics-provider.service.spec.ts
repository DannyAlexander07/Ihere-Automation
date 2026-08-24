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
            ],
            rowCount: 1,
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
});
