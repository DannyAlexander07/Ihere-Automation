export type MetricComparison = {
  current: number;
  previous: number;
  changePercent: number | null;
  favorable: boolean | null;
};

export type AnalyticsSummary = {
  connected: boolean;
  configured: { ga4: boolean; gsc: boolean };
  lastSyncCompletedAt: string | null;
  period: {
    days: number;
    startDate: string;
    endDate: string;
    comparisonStartDate: string;
    comparisonEndDate: string;
  };
  metrics: {
    sessions: MetricComparison;
    activeUsers: MetricComparison;
    views: MetricComparison;
    engagedSessions: MetricComparison;
    averageEngagementTime: MetricComparison;
    keyEvents: MetricComparison;
    clicks: MetricComparison;
    impressions: MetricComparison;
    ctr: MetricComparison;
    averagePosition: MetricComparison;
  };
  daily: Array<{
    date: string;
    sessions: number;
    clicks: number;
    impressions: number;
  }>;
  monthly: Array<{
    month: string;
    sessions: number;
    views: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topPages: Array<{ pagePath: string; sessions: number; views: number }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  pagePerformance: PagePerformance[];
  publicationPerformance: PublicationPerformance[];
  methodology: { note: string; ga4: string; gsc: string };
};

export type PagePerformance = {
  pagePath: string;
  url: string | null;
  title: string;
  source: "I_HERE" | "BLOG_HISTORY";
  noteId: string | null;
  publishedAt: string | null;
  sessions: number;
  activeUsers: number;
  views: number;
  engagedSessions: number;
  engagementRate: number;
  averageEngagementTimeSeconds: number;
  keyEvents: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number }>;
};

export type ContentPublication = {
  id: string;
  clientId: string;
  noteId: string | null;
  title: string;
  url: string;
  pagePath: string;
  publishedAt: string;
  source: "AUTO_DETECTED" | "MANUAL";
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "ARCHIVED";
  confirmedAt: string | null;
  createdAt: string;
  note: {
    currentVersion: number;
    versions: Array<{ title: string; slug: string | null }>;
  } | null;
};

export type PublicationPerformance = ContentPublication & {
  milestones: Array<{
    days: 30 | 60 | 90;
    status: "COMPLETE" | "IN_PROGRESS";
    throughDate: string;
    ga4: {
      sessions: number;
      activeUsers: number;
      views: number;
      engagedSessions: number;
      keyEvents: number;
    };
    gsc: {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };
  }>;
};

export type AnalyticsClient = {
  id: string;
  name: string;
  slug: string;
  analyticsConnections: Array<{
    status: "CONNECTED" | "ERROR" | "REVOKED";
    ga4PropertyId: string | null;
    gscSiteUrl: string | null;
    lastSyncCompletedAt: string | null;
  }>;
};

export type AnalyticsConnectionView = {
  enabled: boolean;
  connected: boolean;
  connection: null | {
    id: string;
    clientId: string;
    status: "CONNECTED" | "ERROR" | "REVOKED";
    googleAccountEmail: string | null;
    ga4PropertyId: string | null;
    gscSiteUrl: string | null;
    lastSyncStartedAt: string | null;
    lastSyncCompletedAt: string | null;
    nextSyncAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
};

export type AnalyticsSources = {
  ga4Properties: Array<{
    id: string;
    displayName: string;
    accountName: string;
  }>;
  gscSites: Array<{ siteUrl: string; permissionLevel: string }>;
};

export type ResultsLink = {
  id: string;
  clientId: string;
  recipientName: string;
  recipientEmail: string;
  reportStartDate: string;
  reportEndDate: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  maxViews: number;
  createdAt: string;
  url?: string;
};

export type PublicResults = {
  client: { name: string; slug: string };
  recipientName: string;
  expiresAt: string;
  summary: AnalyticsSummary;
};
