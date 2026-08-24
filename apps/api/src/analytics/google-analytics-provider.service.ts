import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const userInfoSchema = z.object({ email: z.string().email().optional() });

const ga4ResponseSchema = z.object({
  rowCount: z.number().int().nonnegative().optional(),
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string() })),
        metricValues: z.array(z.object({ value: z.string() })),
      }),
    )
    .optional(),
});

const gscResponseSchema = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string()),
        clicks: z.number().nonnegative().optional(),
        impressions: z.number().nonnegative().optional(),
        ctr: z.number().nonnegative().optional(),
        position: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
});

const analyticsAccountSummariesSchema = z.object({
  accountSummaries: z
    .array(
      z.object({
        account: z.string(),
        displayName: z.string(),
        propertySummaries: z
          .array(
            z.object({
              property: z.string(),
              displayName: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const searchConsoleSitesSchema = z.object({
  siteEntry: z
    .array(
      z.object({
        siteUrl: z.string(),
        permissionLevel: z.string(),
      }),
    )
    .optional(),
});

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  accountEmail?: string;
};

export type Ga4MetricRow = {
  date: Date;
  pagePath: string;
  sessions: number;
  activeUsers: number;
  views: number;
  engagedSessions: number;
  userEngagementDuration: number;
  keyEvents: number;
};

export type GscMetricRow = {
  date: Date;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GoogleAnalyticsSources = {
  ga4Properties: Array<{
    id: string;
    displayName: string;
    accountName: string;
  }>;
  gscSites: Array<{ siteUrl: string; permissionLevel: string }>;
};

export class GoogleAnalyticsProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class GoogleAnalyticsProviderService {
  static readonly scopes = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ];

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<boolean>('ANALYTICS_ENABLED'));
  }

  authorizationUrl(state: string): string {
    this.assertEnabled();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
    );
    url.searchParams.set(
      'redirect_uri',
      this.config.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI'),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set(
      'scope',
      GoogleAnalyticsProviderService.scopes.join(' '),
    );
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GoogleOAuthTokens> {
    this.assertEnabled();
    const response = await this.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>(
            'GOOGLE_OAUTH_CLIENT_SECRET',
          ),
          redirect_uri: this.config.getOrThrow<string>(
            'GOOGLE_OAUTH_REDIRECT_URI',
          ),
          grant_type: 'authorization_code',
        }),
      },
      tokenResponseSchema,
      'GOOGLE_OAUTH_EXCHANGE_FAILED',
    );
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      scopes: response.scope?.split(/\s+/).filter(Boolean) ?? [],
      accountEmail: await this.accountEmail(response.access_token),
    };
  }

  async accessToken(refreshToken: string): Promise<string> {
    this.assertEnabled();
    const response = await this.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>(
            'GOOGLE_OAUTH_CLIENT_SECRET',
          ),
          grant_type: 'refresh_token',
        }),
      },
      tokenResponseSchema,
      'GOOGLE_TOKEN_REFRESH_FAILED',
    );
    return response.access_token;
  }

  async sources(accessToken: string): Promise<GoogleAnalyticsSources> {
    const [analytics, searchConsole] = await Promise.all([
      this.request(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
        { headers: { authorization: `Bearer ${accessToken}` } },
        analyticsAccountSummariesSchema,
        'GA4_PROPERTIES_LIST_FAILED',
      ),
      this.request(
        'https://www.googleapis.com/webmasters/v3/sites',
        { headers: { authorization: `Bearer ${accessToken}` } },
        searchConsoleSitesSchema,
        'GSC_SITES_LIST_FAILED',
      ),
    ]);

    return {
      ga4Properties: (analytics.accountSummaries ?? []).flatMap((account) =>
        (account.propertySummaries ?? []).flatMap((property) => {
          const match = /^properties\/(\d+)$/.exec(property.property);
          return match?.[1]
            ? [
                {
                  id: match[1],
                  displayName: property.displayName,
                  accountName: account.displayName,
                },
              ]
            : [];
        }),
      ),
      gscSites: (searchConsole.siteEntry ?? []).map((site) => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel,
      })),
    };
  }

  async ga4Metrics(input: {
    accessToken: string;
    propertyId: string;
    startDate: string;
    endDate: string;
  }): Promise<Ga4MetricRow[]> {
    const collected: Ga4MetricRow[] = [];
    const pageSize = 100_000;
    const totals = await this.request(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(input.propertyId)}:runReport`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'engagedSessions' },
            { name: 'userEngagementDuration' },
            { name: 'keyEvents' },
          ],
          limit: 100_000,
          keepEmptyRows: false,
        }),
      },
      ga4ResponseSchema,
      'GA4_TOTAL_REPORT_FAILED',
    );
    for (const row of totals.rows ?? []) {
      const dateValue = row.dimensionValues[0]?.value ?? '';
      const metrics = row.metricValues.map((item) => item.value);
      if (!/^\d{8}$/.test(dateValue)) continue;
      collected.push({
        date: compactDate(dateValue),
        pagePath: '__IHERE_TOTAL__',
        sessions: integer(metrics[0]),
        activeUsers: integer(metrics[1]),
        views: integer(metrics[2]),
        engagedSessions: integer(metrics[3]),
        userEngagementDuration: decimal(metrics[4]),
        keyEvents: decimal(metrics[5]),
      });
    }
    for (let offset = 0; offset < 1_000_000; offset += pageSize) {
      const page = await this.request(
        `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(input.propertyId)}:runReport`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [
              { startDate: input.startDate, endDate: input.endDate },
            ],
            dimensions: [{ name: 'date' }, { name: 'pagePath' }],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' },
              { name: 'screenPageViews' },
              { name: 'engagedSessions' },
              { name: 'userEngagementDuration' },
              { name: 'keyEvents' },
            ],
            limit: pageSize,
            offset,
            keepEmptyRows: false,
          }),
        },
        ga4ResponseSchema,
        'GA4_REPORT_FAILED',
      );
      const rows = page.rows ?? [];
      for (const row of rows) {
        const dimensions = row.dimensionValues.map((item) => item.value);
        const metrics = row.metricValues.map((item) => item.value);
        if (!/^\d{8}$/.test(dimensions[0] ?? '')) continue;
        collected.push({
          date: compactDate(dimensions[0]),
          pagePath: (dimensions[1] || '/').slice(0, 2048),
          sessions: integer(metrics[0]),
          activeUsers: integer(metrics[1]),
          views: integer(metrics[2]),
          engagedSessions: integer(metrics[3]),
          userEngagementDuration: decimal(metrics[4]),
          keyEvents: decimal(metrics[5]),
        });
      }
      if (
        rows.length < pageSize ||
        (page.rowCount !== undefined && offset + rows.length >= page.rowCount)
      )
        break;
    }
    return collected;
  }

  async gscMetrics(input: {
    accessToken: string;
    siteUrl: string;
    startDate: string;
    endDate: string;
  }): Promise<GscMetricRow[]> {
    const collected: GscMetricRow[] = [];
    const pageSize = 25_000;
    const totals = await this.request(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          startDate: input.startDate,
          endDate: input.endDate,
          dimensions: ['date'],
          type: 'web',
          dataState: 'final',
          rowLimit: pageSize,
        }),
      },
      gscResponseSchema,
      'GSC_TOTAL_REPORT_FAILED',
    );
    for (const row of totals.rows ?? []) {
      const dateValue = row.keys[0];
      if (!dateValue) continue;
      collected.push({
        date: isoDate(dateValue),
        page: '__IHERE_TOTAL__',
        query: '__IHERE_TOTAL__',
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }
    for (let startRow = 0; startRow < 250_000; startRow += pageSize) {
      const page = await this.request(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            startDate: input.startDate,
            endDate: input.endDate,
            dimensions: ['date', 'page', 'query'],
            type: 'web',
            dataState: 'final',
            rowLimit: pageSize,
            startRow,
          }),
        },
        gscResponseSchema,
        'GSC_REPORT_FAILED',
      );
      const rows = page.rows ?? [];
      for (const row of rows) {
        const [dateValue, pageValue, queryValue] = row.keys;
        if (!dateValue || !pageValue || queryValue === undefined) continue;
        collected.push({
          date: isoDate(dateValue),
          page: pageValue.slice(0, 2048),
          query: queryValue.slice(0, 1000),
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        });
      }
      if (rows.length < pageSize) break;
    }
    return collected;
  }

  private async accountEmail(accessToken: string): Promise<string | undefined> {
    try {
      const response = await this.request(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { authorization: `Bearer ${accessToken}` } },
        userInfoSchema,
        'GOOGLE_USERINFO_FAILED',
      );
      return response.email;
    } catch {
      return undefined;
    }
  }

  private async request<TSchema extends z.ZodType>(
    url: string,
    init: RequestInit,
    schema: TSchema,
    errorCode: string,
  ): Promise<z.infer<TSchema>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    timer.unref();
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new GoogleAnalyticsProviderError(
          errorCode,
          `Google respondió con estado ${response.status}.`,
        );
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new GoogleAnalyticsProviderError(
          `${errorCode}_INVALID_RESPONSE`,
          'Google devolvió una respuesta inesperada.',
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof GoogleAnalyticsProviderError) throw error;
      throw new GoogleAnalyticsProviderError(
        errorCode,
        error instanceof Error && error.name === 'AbortError'
          ? 'Google no respondió dentro del plazo permitido.'
          : 'No se pudo completar la comunicación con Google.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'La integración con Google Analytics no está habilitada.',
      );
    }
  }
}

function compactDate(value: string): Date {
  return new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
    ),
  );
}

function isoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new GoogleAnalyticsProviderError(
      'GOOGLE_INVALID_DATE',
      'Google devolvió una fecha inválida.',
    );
  }
  return date;
}

function integer(value?: string): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function decimal(value?: string): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
