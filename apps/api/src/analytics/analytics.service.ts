import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import {
  clientIdsForPermission,
  hasPermission,
} from '../common/auth/auth-principal';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  AnalyticsConnectionStatus,
  AnalyticsSyncStatus,
  ContentPublicationSource,
  ContentPublicationStatus,
  NoteStatus,
  ResultsPortalLinkStatus,
} from '../generated/prisma/client';
import { AnalyticsTokenVaultService } from './analytics-token-vault.service';
import type { ConfigureAnalyticsDto } from './dto/configure-analytics.dto';
import type { ConfirmPublicationDto } from './dto/confirm-publication.dto';
import type { CreatePublicationDto } from './dto/create-publication.dto';
import type { CreateResultsLinkDto } from './dto/create-results-link.dto';
import type { SyncAnalyticsDto } from './dto/sync-analytics.dto';
import type { StartGoogleOAuthDto } from './dto/start-google-oauth.dto';
import {
  GoogleAnalyticsProviderError,
  GoogleAnalyticsProviderService,
  type Ga4MetricRow,
  type GscMetricRow,
} from './google-analytics-provider.service';
import { buildResultsUrl } from './results-url';

const DAY_MS = 86_400_000;
const TOTAL_MARKER = '__IHERE_TOTAL__';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly google: GoogleAnalyticsProviderService,
    private readonly vault: AnalyticsTokenVaultService,
  ) {}

  async clients(principal: AuthPrincipal) {
    const tenantWide = principal.tenantPermissions.includes('analytics.read');
    return this.prisma.client.findMany({
      where: {
        tenantId: principal.tenantId,
        active: true,
        workspaces: {
          some: { moduleCode: 'automation.notes', active: true },
        },
        ...(tenantWide
          ? {}
          : {
              id: {
                in: clientIdsForPermission(principal, 'analytics.read'),
              },
            }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        analyticsConnections: {
          select: {
            status: true,
            ga4PropertyId: true,
            gscSiteUrl: true,
            lastSyncCompletedAt: true,
          },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async connection(clientId: string, principal: AuthPrincipal) {
    this.assertPermission(principal, 'analytics.read', clientId);
    await this.assertClient(clientId, principal.tenantId);
    const connection = await this.prisma.analyticsConnection.findUnique({
      where: {
        tenantId_clientId: { tenantId: principal.tenantId, clientId },
      },
      select: connectionSelect,
    });
    return {
      enabled: this.google.enabled,
      connected: connection?.status === AnalyticsConnectionStatus.CONNECTED,
      connection,
    };
  }

  async sources(clientId: string, principal: AuthPrincipal) {
    this.assertPermission(principal, 'analytics.manage', clientId);
    const connection = await this.connectionForTenant(
      clientId,
      principal.tenantId,
    );
    try {
      const accessToken = await this.google.accessToken(
        this.vault.decrypt(connection.encryptedRefreshToken),
      );
      return await this.google.sources(accessToken);
    } catch (error) {
      if (error instanceof GoogleAnalyticsProviderError) {
        throw new BadRequestException({
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  }

  async startOAuth(input: StartGoogleOAuthDto, principal: AuthPrincipal) {
    this.assertPermission(principal, 'analytics.manage', input.clientId);
    await this.assertClient(input.clientId, principal.tenantId);
    const state = randomBytes(32).toString('base64url');
    const stateHash = hashToken(state);
    const returnPath = safeReturnPath(input.returnPath);
    await this.prisma.analyticsOAuthState.create({
      data: {
        tenantId: principal.tenantId,
        clientId: input.clientId,
        requestedById: principal.userId,
        stateHash,
        returnPath,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return { authorizationUrl: this.google.authorizationUrl(state) };
  }

  async completeOAuth(state: string, code: string): Promise<string> {
    const stateHash = hashToken(state);
    const saved = await this.prisma.analyticsOAuthState.findUnique({
      where: { stateHash },
    });
    if (!saved || saved.expiresAt <= new Date() || saved.consumedAt) {
      throw new BadRequestException(
        'La autorización de Google expiró o ya fue utilizada.',
      );
    }
    const consumed = await this.prisma.analyticsOAuthState.updateMany({
      where: {
        id: saved.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException(
        'La autorización de Google expiró o ya fue utilizada.',
      );
    }
    const tokens = await this.google.exchangeCode(code);
    const existing = await this.prisma.analyticsConnection.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: saved.tenantId,
          clientId: saved.clientId,
        },
      },
      select: { encryptedRefreshToken: true },
    });
    const encryptedRefreshToken = tokens.refreshToken
      ? this.vault.encrypt(tokens.refreshToken)
      : existing?.encryptedRefreshToken;
    if (!encryptedRefreshToken) {
      throw new BadRequestException(
        'Google no entregó autorización permanente. Vuelve a conectar la cuenta.',
      );
    }
    const connection = await this.prisma.analyticsConnection.upsert({
      where: {
        tenantId_clientId: {
          tenantId: saved.tenantId,
          clientId: saved.clientId,
        },
      },
      create: {
        tenantId: saved.tenantId,
        clientId: saved.clientId,
        createdById: saved.requestedById,
        encryptedRefreshToken,
        scopes:
          tokens.scopes.length > 0
            ? tokens.scopes
            : GoogleAnalyticsProviderService.scopes,
        googleAccountEmail: tokens.accountEmail,
        nextSyncAt: new Date(),
      },
      update: {
        status: AnalyticsConnectionStatus.CONNECTED,
        encryptedRefreshToken,
        scopes:
          tokens.scopes.length > 0
            ? tokens.scopes
            : GoogleAnalyticsProviderService.scopes,
        googleAccountEmail: tokens.accountEmail,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextSyncAt: new Date(),
      },
      select: { id: true },
    });
    await this.audit.record({
      tenantId: saved.tenantId,
      clientId: saved.clientId,
      userId: saved.requestedById,
      action: 'analytics.google.connected',
      entityType: 'AnalyticsConnection',
      entityId: connection.id,
      metadata: { scopes: tokens.scopes },
    });
    return `${safeReturnPath(saved.returnPath)}?google=connected`;
  }

  async configure(
    clientId: string,
    input: ConfigureAnalyticsDto,
    principal: AuthPrincipal,
  ) {
    this.assertPermission(principal, 'analytics.manage', clientId);
    if (input.ga4PropertyId === undefined && input.gscSiteUrl === undefined) {
      throw new BadRequestException(
        'Indica una propiedad de GA4 o un sitio de Search Console.',
      );
    }
    const current = await this.connectionForTenant(
      clientId,
      principal.tenantId,
    );
    const updated = await this.prisma.analyticsConnection.update({
      where: { id: current.id },
      data: {
        ...(input.ga4PropertyId !== undefined
          ? { ga4PropertyId: input.ga4PropertyId }
          : {}),
        ...(input.gscSiteUrl !== undefined
          ? { gscSiteUrl: input.gscSiteUrl }
          : {}),
        nextSyncAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      select: connectionSelect,
    });
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId,
      userId: principal.userId,
      action: 'analytics.connection.configured',
      entityType: 'AnalyticsConnection',
      entityId: current.id,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      after: {
        ga4PropertyId: updated.ga4PropertyId,
        gscSiteUrl: updated.gscSiteUrl,
      },
    });
    return updated;
  }

  async sync(
    clientId: string,
    input: SyncAnalyticsDto,
    principal: AuthPrincipal,
  ) {
    this.assertPermission(principal, 'analytics.manage', clientId);
    const connection = await this.connectionForTenant(
      clientId,
      principal.tenantId,
    );
    if (!connection.ga4PropertyId && !connection.gscSiteUrl) {
      throw new BadRequestException(
        'Configura GA4 o Search Console antes de sincronizar.',
      );
    }
    if (
      connection.lastSyncStartedAt &&
      (!connection.lastSyncCompletedAt ||
        connection.lastSyncStartedAt > connection.lastSyncCompletedAt) &&
      connection.lastSyncStartedAt.getTime() > Date.now() - 15 * 60_000
    ) {
      throw new ConflictException('Ya existe una sincronización en curso.');
    }
    void this.syncClient(
      clientId,
      principal.tenantId,
      principal.userId,
      input,
      principal,
    ).catch((error: unknown) => {
      this.logger.error(
        `La sincronización manual del cliente ${clientId} falló: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    });
    return {
      status: AnalyticsSyncStatus.RUNNING,
      message:
        'La sincronización empezó en segundo plano. Puedes continuar trabajando.',
    };
  }

  async syncScheduled(connectionId: string): Promise<void> {
    const connection = await this.prisma.analyticsConnection.findUnique({
      where: { id: connectionId },
      select: { clientId: true, tenantId: true },
    });
    if (!connection) return;
    await this.syncClient(connection.clientId, connection.tenantId, null, {});
  }

  async summary(
    clientId: string,
    days: number,
    principal: AuthPrincipal,
    startDate?: string,
    endDate?: string,
  ) {
    this.assertPermission(principal, 'analytics.read', clientId);
    await this.assertClient(clientId, principal.tenantId);
    return this.summaryForClient(
      principal.tenantId,
      clientId,
      days,
      startDate,
      endDate,
    );
  }

  async publications(clientId: string, principal: AuthPrincipal) {
    this.assertPermission(principal, 'analytics.read', clientId);
    await this.assertClient(clientId, principal.tenantId);
    return this.prisma.contentPublication.findMany({
      where: { tenantId: principal.tenantId, clientId },
      select: publicationSelect,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createPublication(
    input: CreatePublicationDto,
    principal: AuthPrincipal,
  ) {
    this.assertPermission(principal, 'analytics.manage', input.clientId);
    const note = await this.prisma.noteDocument.findFirst({
      where: {
        id: input.noteId,
        tenantId: principal.tenantId,
        clientId: input.clientId,
        status: NoteStatus.EXPORTED,
      },
      select: { id: true },
    });
    if (!note) {
      throw new BadRequestException(
        'La publicación debe corresponder a una nota exportada de este cliente.',
      );
    }
    const url = normalizedPublicationUrl(input.url);
    const publishedAt = publicationDate(input.publishedAt);
    const publication = await this.prisma.contentPublication.upsert({
      where: { clientId_url: { clientId: input.clientId, url } },
      create: {
        tenantId: principal.tenantId,
        clientId: input.clientId,
        noteId: note.id,
        url,
        pagePath: new URL(url).pathname,
        publishedAt,
        source: ContentPublicationSource.MANUAL,
        status: ContentPublicationStatus.CONFIRMED,
        createdById: principal.userId,
        confirmedById: principal.userId,
        confirmedAt: new Date(),
      },
      update: {
        noteId: note.id,
        pagePath: new URL(url).pathname,
        publishedAt,
        source: ContentPublicationSource.MANUAL,
        status: ContentPublicationStatus.CONFIRMED,
        confirmedById: principal.userId,
        confirmedAt: new Date(),
      },
      select: publicationSelect,
    });
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId: input.clientId,
      userId: principal.userId,
      action: 'analytics.publication.confirmed_manual',
      entityType: 'ContentPublication',
      entityId: publication.id,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      after: { url, publishedAt },
    });
    return publication;
  }

  async confirmPublication(
    id: string,
    input: ConfirmPublicationDto,
    principal: AuthPrincipal,
  ) {
    const current = await this.prisma.contentPublication.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!current) throw new NotFoundException('Publicación no encontrada.');
    this.assertPermission(principal, 'analytics.manage', current.clientId);
    const url = input.url ? normalizedPublicationUrl(input.url) : current.url;
    const publishedAt = input.publishedAt
      ? publicationDate(input.publishedAt)
      : current.publishedAt;
    const updated = await this.prisma.contentPublication.update({
      where: { id },
      data: {
        url,
        pagePath: new URL(url).pathname,
        publishedAt,
        status: ContentPublicationStatus.CONFIRMED,
        confirmedById: principal.userId,
        confirmedAt: new Date(),
      },
      select: publicationSelect,
    });
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId: current.clientId,
      userId: principal.userId,
      action: 'analytics.publication.confirmed',
      entityType: 'ContentPublication',
      entityId: id,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      before: { url: current.url, publishedAt: current.publishedAt },
      after: { url, publishedAt },
    });
    return updated;
  }

  async createResultsLink(
    input: CreateResultsLinkDto,
    principal: AuthPrincipal,
  ) {
    this.assertPermission(principal, 'results_links.manage', input.clientId);
    const client = await this.assertClient(input.clientId, principal.tenantId);
    const reportPeriod = reportingPeriod(
      28,
      input.reportStartDate,
      input.reportEndDate,
    );
    const token = randomBytes(32).toString('base64url');
    const link = await this.prisma.resultsPortalLink.create({
      data: {
        tenantId: principal.tenantId,
        clientId: input.clientId,
        tokenHash: hashToken(token),
        recipientName: input.recipientName.trim(),
        recipientEmail: input.recipientEmail.trim().toLowerCase(),
        reportStartDate: reportPeriod.currentStart,
        reportEndDate: reportPeriod.currentEnd,
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
        createdById: principal.userId,
      },
      select: resultsLinkSelect,
    });
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId: input.clientId,
      userId: principal.userId,
      action: 'analytics.results_link.created',
      entityType: 'ResultsPortalLink',
      entityId: link.id,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      metadata: {
        recipientEmail: link.recipientEmail,
        expiresAt: link.expiresAt,
      },
    });
    return {
      ...link,
      clientName: client.name,
      url: buildResultsUrl(
        this.config.getOrThrow<string>('PUBLIC_WEB_URL'),
        token,
      ),
    };
  }

  async listResultsLinks(clientId: string, principal: AuthPrincipal) {
    this.assertPermission(principal, 'results_links.manage', clientId);
    await this.assertClient(clientId, principal.tenantId);
    return this.prisma.resultsPortalLink.findMany({
      where: { tenantId: principal.tenantId, clientId },
      select: resultsLinkSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeResultsLink(id: string, principal: AuthPrincipal) {
    const link = await this.prisma.resultsPortalLink.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!link)
      throw new NotFoundException('Enlace de resultados no encontrado.');
    this.assertPermission(principal, 'results_links.manage', link.clientId);
    if (link.status !== ResultsPortalLinkStatus.ACTIVE)
      return { revoked: true };
    await this.prisma.resultsPortalLink.update({
      where: { id: link.id },
      data: {
        status: ResultsPortalLinkStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: principal.userId,
      },
    });
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId: link.clientId,
      userId: principal.userId,
      action: 'analytics.results_link.revoked',
      entityType: 'ResultsPortalLink',
      entityId: link.id,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
    });
    return { revoked: true };
  }

  async publicResults(token: string) {
    const tokenHash = hashToken(requirePublicToken(token));
    const now = new Date();
    const link = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.resultsPortalLink.updateMany({
        where: {
          tokenHash,
          status: ResultsPortalLinkStatus.ACTIVE,
          expiresAt: { gt: now },
          viewCount: { lt: 1000 },
        },
        data: { viewCount: { increment: 1 }, lastViewedAt: now },
      });
      if (claimed.count !== 1) return null;
      return transaction.resultsPortalLink.findUnique({
        where: { tokenHash },
        select: {
          tenantId: true,
          clientId: true,
          expiresAt: true,
          recipientName: true,
          reportStartDate: true,
          reportEndDate: true,
          client: { select: { name: true, slug: true } },
        },
      });
    });
    if (!link) throw new NotFoundException('Enlace no disponible.');
    const summary = await this.summaryForClient(
      link.tenantId,
      link.clientId,
      28,
      dateText(link.reportStartDate),
      dateText(link.reportEndDate),
    );
    return {
      client: link.client,
      recipientName: link.recipientName,
      expiresAt: link.expiresAt,
      summary,
    };
  }

  private async syncClient(
    clientId: string,
    tenantId: string,
    requestedById: string | null,
    input: SyncAnalyticsDto,
    principal?: AuthPrincipal,
  ) {
    const connection = await this.connectionForTenant(clientId, tenantId);
    if (
      connection.lastSyncStartedAt &&
      (!connection.lastSyncCompletedAt ||
        connection.lastSyncStartedAt > connection.lastSyncCompletedAt) &&
      connection.lastSyncStartedAt.getTime() > Date.now() - 15 * 60_000
    ) {
      throw new ConflictException('Ya existe una sincronización en curso.');
    }
    if (!connection.ga4PropertyId && !connection.gscSiteUrl) {
      throw new BadRequestException(
        'Configura GA4 o Search Console antes de sincronizar.',
      );
    }
    const range = syncRange(input.startDate, input.endDate);
    const run = await this.prisma.$transaction(
      async (transaction) => {
        const claimed = await transaction.analyticsConnection.updateMany({
          where: {
            id: connection.id,
            lastSyncStartedAt: connection.lastSyncStartedAt,
            lastSyncCompletedAt: connection.lastSyncCompletedAt,
            status: AnalyticsConnectionStatus.CONNECTED,
          },
          data: {
            lastSyncStartedAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Ya existe una sincronización en curso.');
        }
        return transaction.analyticsSyncRun.create({
          data: {
            connectionId: connection.id,
            tenantId,
            clientId,
            requestedById,
            startDate: range.start,
            endDate: range.end,
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    try {
      const accessToken = await this.google.accessToken(
        this.vault.decrypt(connection.encryptedRefreshToken),
      );
      const [ga4Rows, gscRows] = await Promise.all([
        connection.ga4PropertyId
          ? this.google.ga4Metrics({
              accessToken,
              propertyId: connection.ga4PropertyId,
              startDate: range.startText,
              endDate: range.endText,
            })
          : Promise.resolve([]),
        connection.gscSiteUrl
          ? this.google.gscMetrics({
              accessToken,
              siteUrl: connection.gscSiteUrl,
              startDate: range.startText,
              endDate: range.endText,
            })
          : Promise.resolve([]),
      ]);
      await this.persistMetrics(connection, range, ga4Rows, gscRows, run.id);
      await this.discoverPublications(connection, ga4Rows, gscRows);
      await this.audit.record({
        tenantId,
        clientId,
        userId: requestedById ?? undefined,
        action: 'analytics.sync.completed',
        entityType: 'AnalyticsSyncRun',
        entityId: run.id,
        requestId: principal?.requestId,
        ipAddress: principal?.ipAddress,
        userAgent: principal?.userAgent,
        metadata: { ga4Rows: ga4Rows.length, gscRows: gscRows.length },
      });
      return {
        id: run.id,
        status: AnalyticsSyncStatus.COMPLETED,
        ga4Rows: ga4Rows.length,
        gscRows: gscRows.length,
        startDate: range.startText,
        endDate: range.endText,
      };
    } catch (error) {
      const code =
        error instanceof GoogleAnalyticsProviderError
          ? error.code
          : 'ANALYTICS_SYNC_FAILED';
      const message =
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : 'La sincronización no pudo completarse.';
      const completedAt = new Date();
      const cleanupResults = await Promise.allSettled([
        this.prisma.analyticsSyncRun.update({
          where: { id: run.id },
          data: {
            status: AnalyticsSyncStatus.FAILED,
            errorCode: code,
            errorMessage: message,
            completedAt,
          },
        }),
        this.prisma.analyticsConnection.update({
          where: { id: connection.id },
          data: {
            status:
              code === 'GOOGLE_TOKEN_REFRESH_FAILED'
                ? AnalyticsConnectionStatus.ERROR
                : connection.status,
            lastSyncStartedAt: null,
            lastErrorCode: code,
            lastErrorMessage: message,
            nextSyncAt: new Date(Date.now() + 6 * 60 * 60_000),
          },
        }),
      ]);
      cleanupResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `No se pudo cerrar ${index === 0 ? 'la ejecución' : 'la conexión'} tras una sincronización fallida.`,
            result.reason instanceof Error
              ? result.reason.stack
              : String(result.reason),
          );
        }
      });
      throw error;
    }
  }

  private async persistMetrics(
    connection: Awaited<ReturnType<AnalyticsService['connectionForTenant']>>,
    range: ReturnType<typeof syncRange>,
    ga4Rows: Ga4MetricRow[],
    gscRows: GscMetricRow[],
    runId: string,
  ): Promise<void> {
    const completedAt = new Date();
    const batches = metricPersistenceBatches(
      range.start,
      range.end,
      ga4Rows,
      gscRows,
    );
    for (const batch of batches) {
      await this.prisma.$transaction(
        async (transaction) => {
          await transaction.ga4PageMetric.deleteMany({
            where: {
              connectionId: connection.id,
              date: { gte: batch.start, lte: batch.end },
            },
          });
          await transaction.gscSearchMetric.deleteMany({
            where: {
              connectionId: connection.id,
              date: { gte: batch.start, lte: batch.end },
            },
          });
          for (const rows of chunks(batch.ga4Rows, 2_000)) {
            await transaction.ga4PageMetric.createMany({
              data: rows.map((row) => ({
                ...row,
                connectionId: connection.id,
                tenantId: connection.tenantId,
                clientId: connection.clientId,
              })),
            });
          }
          for (const rows of chunks(batch.gscRows, 2_000)) {
            await transaction.gscSearchMetric.createMany({
              data: rows.map((row) => ({
                ...row,
                connectionId: connection.id,
                tenantId: connection.tenantId,
                clientId: connection.clientId,
              })),
            });
          }
        },
        { maxWait: 10_000, timeout: 300_000 },
      );
    }
    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.analyticsSyncRun.update({
          where: { id: runId },
          data: {
            status: AnalyticsSyncStatus.COMPLETED,
            ga4Rows: ga4Rows.length,
            gscRows: gscRows.length,
            completedAt,
          },
        });
        await transaction.analyticsConnection.update({
          where: { id: connection.id },
          data: {
            status: AnalyticsConnectionStatus.CONNECTED,
            lastSyncStartedAt: null,
            lastSyncCompletedAt: completedAt,
            nextSyncAt: new Date(Date.now() + 6 * 60 * 60_000),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  private async summaryForClient(
    tenantId: string,
    clientId: string,
    days: number,
    startDate?: string,
    endDate?: string,
  ) {
    const connection = await this.prisma.analyticsConnection.findUnique({
      where: { tenantId_clientId: { tenantId, clientId } },
      select: connectionSelect,
    });
    const period = reportingPeriod(days, startDate, endDate);
    const [ga4, gsc, publicationPerformance] = await Promise.all([
      this.prisma.ga4PageMetric.findMany({
        where: {
          tenantId,
          clientId,
          date: { gte: period.previousStart, lte: period.currentEnd },
        },
        select: {
          date: true,
          pagePath: true,
          sessions: true,
          activeUsers: true,
          views: true,
          engagedSessions: true,
          userEngagementDuration: true,
          keyEvents: true,
        },
      }),
      this.prisma.gscSearchMetric.findMany({
        where: {
          tenantId,
          clientId,
          date: { gte: period.previousStart, lte: period.currentEnd },
        },
        select: {
          date: true,
          page: true,
          query: true,
          clicks: true,
          impressions: true,
          ctr: true,
          position: true,
        },
      }),
      this.publicationPerformance(tenantId, clientId),
    ]);
    const summary = buildAnalyticsSummary(connection, period, ga4, gsc, 'BLOG');
    return {
      ...summary,
      pagePerformance: buildPagePerformance(
        connection,
        period,
        ga4,
        gsc,
        publicationPerformance,
      ),
      publicationPerformance,
    };
  }

  private async discoverPublications(
    connection: Awaited<ReturnType<AnalyticsService['connectionForTenant']>>,
    ga4Rows: Ga4MetricRow[],
    gscRows: GscMetricRow[],
  ) {
    const notes = await this.prisma.noteDocument.findMany({
      where: {
        tenantId: connection.tenantId,
        clientId: connection.clientId,
        status: NoteStatus.EXPORTED,
      },
      select: {
        id: true,
        currentVersion: true,
        versions: {
          select: { slug: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    for (const note of notes) {
      const slug = note.versions[0]?.slug?.trim();
      if (!slug || slug.length < 5) continue;
      const gscMatches = gscRows.filter(
        (row) => row.page !== TOTAL_MARKER && pageContainsSlug(row.page, slug),
      );
      const ga4Matches = ga4Rows.filter(
        (row) =>
          row.pagePath !== TOTAL_MARKER && pageContainsSlug(row.pagePath, slug),
      );
      const gscUrl = gscMatches[0]?.page;
      const pagePath = gscUrl
        ? publicationPath(gscUrl)
        : ga4Matches[0]?.pagePath;
      if (!pagePath) continue;
      const url = gscUrl
        ? normalizedPublicationUrl(gscUrl)
        : absolutePublicationUrl(pagePath, connection.gscSiteUrl);
      if (!url) continue;
      const dates = [...gscMatches, ...ga4Matches].map((row) => row.date);
      const publishedAt = new Date(
        Math.min(...dates.map((date) => date.getTime())),
      );
      await this.prisma.contentPublication.upsert({
        where: { clientId_url: { clientId: connection.clientId, url } },
        create: {
          tenantId: connection.tenantId,
          clientId: connection.clientId,
          noteId: note.id,
          url,
          pagePath,
          publishedAt,
          source: ContentPublicationSource.AUTO_DETECTED,
        },
        update: {},
      });
    }
  }

  private async publicationPerformance(tenantId: string, clientId: string) {
    const publications = await this.prisma.contentPublication.findMany({
      where: {
        tenantId,
        clientId,
        status: ContentPublicationStatus.CONFIRMED,
      },
      select: publicationSelect,
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    if (!publications.length) return [];
    const start = new Date(
      Math.min(...publications.map((item) => item.publishedAt.getTime())),
    );
    const end = new Date(
      Math.min(
        utcDay(new Date()).getTime() - DAY_MS,
        Math.max(
          ...publications.map(
            (item) => item.publishedAt.getTime() + 89 * DAY_MS,
          ),
        ),
      ),
    );
    const [ga4, gsc] = await Promise.all([
      this.prisma.ga4PageMetric.findMany({
        where: { tenantId, clientId, date: { gte: start, lte: end } },
      }),
      this.prisma.gscSearchMetric.findMany({
        where: { tenantId, clientId, date: { gte: start, lte: end } },
      }),
    ]);
    return publications.map((publication) => ({
      ...publication,
      milestones: [30, 60, 90].map((days) => {
        const cutoff = new Date(
          publication.publishedAt.getTime() + (days - 1) * DAY_MS,
        );
        const completed = end >= cutoff;
        const effectiveEnd = completed
          ? cutoff
          : end >= publication.publishedAt
            ? end
            : publication.publishedAt;
        const pageGa4 = ga4.filter(
          (row) =>
            row.date >= publication.publishedAt &&
            row.date <= effectiveEnd &&
            samePage(row.pagePath, publication),
        );
        const pageGsc = gsc.filter(
          (row) =>
            row.date >= publication.publishedAt &&
            row.date <= effectiveEnd &&
            samePage(row.page, publication),
        );
        return {
          days,
          status: completed ? 'COMPLETE' : 'IN_PROGRESS',
          throughDate: dateText(effectiveEnd),
          ga4: sumGa4(pageGa4),
          gsc: sumGsc(pageGsc),
        };
      }),
    }));
  }

  private async connectionForTenant(clientId: string, tenantId: string) {
    const connection = await this.prisma.analyticsConnection.findUnique({
      where: { tenantId_clientId: { tenantId, clientId } },
    });
    if (
      !connection ||
      connection.status === AnalyticsConnectionStatus.REVOKED
    ) {
      throw new NotFoundException(
        'Conexión analítica no encontrada para este cliente.',
      );
    }
    return connection;
  }

  private async assertClient(clientId: string, tenantId: string) {
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        tenantId,
        active: true,
        workspaces: {
          some: { moduleCode: 'automation.notes', active: true },
        },
      },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return client;
  }

  private assertPermission(
    principal: AuthPrincipal,
    permission: string,
    clientId: string,
  ): void {
    if (!hasPermission(principal, permission, clientId)) {
      throw new ForbiddenException('No tienes acceso a este cliente.');
    }
  }
}

const connectionSelect = {
  id: true,
  clientId: true,
  status: true,
  googleAccountEmail: true,
  ga4PropertyId: true,
  gscSiteUrl: true,
  lastSyncStartedAt: true,
  lastSyncCompletedAt: true,
  nextSyncAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

const resultsLinkSelect = {
  id: true,
  clientId: true,
  recipientName: true,
  recipientEmail: true,
  reportStartDate: true,
  reportEndDate: true,
  status: true,
  expiresAt: true,
  lastViewedAt: true,
  viewCount: true,
  maxViews: true,
  createdAt: true,
} as const;

const publicationSelect = {
  id: true,
  clientId: true,
  noteId: true,
  url: true,
  pagePath: true,
  publishedAt: true,
  source: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  note: {
    select: {
      currentVersion: true,
      versions: {
        orderBy: { version: 'desc' as const },
        take: 1,
        select: { title: true, slug: true },
      },
    },
  },
} as const;

function requirePublicToken(value: string): string {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new NotFoundException('Enlace no disponible.');
  }
  return token;
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeReturnPath(value?: string): string {
  if (!value) return '/portal/resultados';
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    !/^\/[A-Za-z0-9/_-]*(?:\?[A-Za-z0-9_=&.-]*)?$/.test(value)
  ) {
    return '/portal/resultados';
  }
  return value;
}

function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function publicationDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = utcDay(new Date());
  if (Number.isNaN(date.getTime()) || date > today) {
    throw new BadRequestException(
      'La fecha de publicación debe ser válida y no puede estar en el futuro.',
    );
  }
  return date;
}

function normalizedPublicationUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('La URL de publicación no es válida.');
  }
  url.hash = '';
  return url.toString();
}

function publicationPath(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function absolutePublicationUrl(
  pagePath: string,
  configuredSite: string | null,
): string | null {
  if (!configuredSite) return null;
  try {
    return normalizedPublicationUrl(
      new URL(pagePath, configuredSite).toString(),
    );
  } catch {
    return null;
  }
}

function pageContainsSlug(value: string, slug: string): boolean {
  try {
    return decodeURIComponent(new URL(value, 'https://ihere.local').pathname)
      .toLocaleLowerCase('es-PE')
      .includes(slug.toLocaleLowerCase('es-PE'));
  } catch {
    return false;
  }
}

function samePage(
  value: string,
  publication: { url: string; pagePath: string },
): boolean {
  if (value === publication.url || value === publication.pagePath) return true;
  try {
    return new URL(value, publication.url).pathname === publication.pagePath;
  } catch {
    return false;
  }
}

function syncRange(startValue?: string, endValue?: string) {
  const yesterday = new Date(utcDay(new Date()).getTime() - DAY_MS);
  const end = endValue ? new Date(`${endValue}T00:00:00.000Z`) : yesterday;
  const start = startValue
    ? new Date(`${startValue}T00:00:00.000Z`)
    : new Date(end.getTime() - 89 * DAY_MS);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end ||
    end > yesterday ||
    end.getTime() - start.getTime() > 365 * DAY_MS
  ) {
    throw new BadRequestException(
      'El rango debe ser válido, no futuro y no mayor a 366 días.',
    );
  }
  return {
    start,
    end,
    startText: dateText(start),
    endText: dateText(end),
  };
}

export function metricPersistenceBatches(
  rangeStart: Date,
  rangeEnd: Date,
  ga4Rows: Ga4MetricRow[],
  gscRows: GscMetricRow[],
) {
  const batches: Array<{
    start: Date;
    end: Date;
    ga4Rows: Ga4MetricRow[];
    gscRows: GscMetricRow[];
  }> = [];
  let cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    const inBatch = (row: { date: Date }) =>
      row.date >= dayStart && row.date <= dayEnd;
    batches.push({
      start: dayStart,
      end: dayEnd,
      ga4Rows: ga4Rows.filter(inBatch),
      gscRows: gscRows.filter(inBatch),
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return batches;
}

function reportingPeriod(days: number, startDate?: string, endDate?: string) {
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new BadRequestException(
      'Indica juntas la fecha inicial y final del informe.',
    );
  }
  let currentEnd = new Date(utcDay(new Date()).getTime() - DAY_MS);
  let currentStart = new Date(currentEnd.getTime() - (days - 1) * DAY_MS);
  if (startDate && endDate) {
    currentStart = new Date(`${startDate}T00:00:00.000Z`);
    currentEnd = new Date(`${endDate}T00:00:00.000Z`);
    const calculatedDays =
      Math.floor((currentEnd.getTime() - currentStart.getTime()) / DAY_MS) + 1;
    if (
      !Number.isFinite(calculatedDays) ||
      calculatedDays < 1 ||
      calculatedDays > 366 ||
      currentEnd >= utcDay(new Date())
    ) {
      throw new BadRequestException(
        'El periodo del informe debe ser válido, anterior a hoy y no mayor a 366 días.',
      );
    }
    days = calculatedDays;
  }
  const previousEnd = new Date(currentStart.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_MS);
  return { days, currentStart, currentEnd, previousStart, previousEnd };
}

export function buildAnalyticsSummary(
  connection:
    | (Record<string, unknown> & {
        status: AnalyticsConnectionStatus;
        lastSyncCompletedAt: Date | null;
        ga4PropertyId: string | null;
        gscSiteUrl: string | null;
      })
    | null,
  period: ReturnType<typeof reportingPeriod>,
  ga4: Array<{
    date: Date;
    pagePath: string;
    sessions: number;
    activeUsers: number;
    views: number;
    engagedSessions: number;
    userEngagementDuration: number;
    keyEvents: number;
  }>,
  gsc: Array<{
    date: Date;
    page: string;
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>,
  scope: 'SITE' | 'BLOG' = 'SITE',
) {
  const scopedGa4 =
    scope === 'BLOG'
      ? ga4.filter(
          (row) =>
            row.pagePath !== TOTAL_MARKER &&
            isBlogPage(normalizedPagePath(row.pagePath)),
        )
      : ga4;
  const scopedGsc =
    scope === 'BLOG'
      ? gsc.filter(
          (row) =>
            row.page !== TOTAL_MARKER &&
            isBlogPage(normalizedPagePath(row.page)),
        )
      : gsc;
  const isCurrent = (date: Date) => date >= period.currentStart;
  const ga4Current = scopedGa4.filter((row) => isCurrent(row.date));
  const ga4Previous = scopedGa4.filter((row) => !isCurrent(row.date));
  const gscCurrent = scopedGsc.filter((row) => isCurrent(row.date));
  const gscPrevious = scopedGsc.filter((row) => !isCurrent(row.date));
  const currentGa4 = sumGa4(ga4Current);
  const previousGa4 = sumGa4(ga4Previous);
  const currentGsc = sumGsc(gscCurrent);
  const previousGsc = sumGsc(gscPrevious);
  return {
    connected: connection?.status === AnalyticsConnectionStatus.CONNECTED,
    configured: {
      ga4: Boolean(connection?.ga4PropertyId),
      gsc: Boolean(connection?.gscSiteUrl),
    },
    lastSyncCompletedAt: connection?.lastSyncCompletedAt ?? null,
    period: {
      days: period.days,
      startDate: dateText(period.currentStart),
      endDate: dateText(period.currentEnd),
      comparisonStartDate: dateText(period.previousStart),
      comparisonEndDate: dateText(period.previousEnd),
    },
    metrics: {
      sessions: metric(currentGa4.sessions, previousGa4.sessions),
      activeUsers: metric(currentGa4.activeUsers, previousGa4.activeUsers),
      views: metric(currentGa4.views, previousGa4.views),
      engagedSessions: metric(
        currentGa4.engagedSessions,
        previousGa4.engagedSessions,
      ),
      averageEngagementTime: metric(
        safeRatio(currentGa4.userEngagementDuration, currentGa4.sessions),
        safeRatio(previousGa4.userEngagementDuration, previousGa4.sessions),
      ),
      keyEvents: metric(currentGa4.keyEvents, previousGa4.keyEvents),
      clicks: metric(currentGsc.clicks, previousGsc.clicks),
      impressions: metric(currentGsc.impressions, previousGsc.impressions),
      ctr: metric(currentGsc.ctr, previousGsc.ctr),
      averagePosition: metric(currentGsc.position, previousGsc.position, true),
    },
    daily: dailySeries(period, ga4Current, gscCurrent),
    monthly: monthlySeries(ga4Current, gscCurrent),
    topPages: topPages(ga4Current),
    topQueries: topQueries(gscCurrent),
    methodology: {
      note:
        scope === 'BLOG'
          ? 'El alcance corresponde únicamente a URLs del blog. Las variaciones muestran correlación entre periodos y no atribuyen causalidad a automatización, SEO ni GEO.'
          : 'Las variaciones muestran correlación entre periodos; no atribuyen causalidad a automatización, SEO ni GEO.',
      ga4: 'Sesiones, usuarios activos, vistas, sesiones con interacción y eventos clave reportados por GA4.',
      gsc: 'Clics, impresiones, CTR y posición media reportados por Search Console.',
    },
  };
}

function sumGa4(rows: Parameters<typeof buildAnalyticsSummary>[2]) {
  const source = rows.some((row) => row.pagePath === TOTAL_MARKER)
    ? rows.filter((row) => row.pagePath === TOTAL_MARKER)
    : rows;
  return source.reduce(
    (total, row) => ({
      sessions: total.sessions + row.sessions,
      activeUsers: total.activeUsers + row.activeUsers,
      views: total.views + row.views,
      engagedSessions: total.engagedSessions + row.engagedSessions,
      userEngagementDuration:
        total.userEngagementDuration + row.userEngagementDuration,
      keyEvents: total.keyEvents + row.keyEvents,
    }),
    {
      sessions: 0,
      activeUsers: 0,
      views: 0,
      engagedSessions: 0,
      userEngagementDuration: 0,
      keyEvents: 0,
    },
  );
}

function sumGsc(rows: Parameters<typeof buildAnalyticsSummary>[3]) {
  const source = rows.some(
    (row) => row.page === TOTAL_MARKER && row.query === TOTAL_MARKER,
  )
    ? rows.filter(
        (row) => row.page === TOTAL_MARKER && row.query === TOTAL_MARKER,
      )
    : rows;
  const totals = source.reduce(
    (total, row) => ({
      clicks: total.clicks + row.clicks,
      impressions: total.impressions + row.impressions,
      weightedPosition: total.weightedPosition + row.position * row.impressions,
    }),
    { clicks: 0, impressions: 0, weightedPosition: 0 },
  );
  return {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    position:
      totals.impressions > 0 ? totals.weightedPosition / totals.impressions : 0,
  };
}

function metric(current: number, previous: number, lowerIsBetter = false) {
  const changePercent =
    previous === 0
      ? current === 0
        ? 0
        : null
      : ((current - previous) / previous) * 100;
  return {
    current,
    previous,
    changePercent,
    favorable:
      changePercent === null || changePercent === 0
        ? null
        : lowerIsBetter
          ? changePercent < 0
          : changePercent > 0,
  };
}

function dailySeries(
  period: ReturnType<typeof reportingPeriod>,
  ga4: Parameters<typeof buildAnalyticsSummary>[2],
  gsc: Parameters<typeof buildAnalyticsSummary>[3],
) {
  const series = new Map<
    string,
    { date: string; sessions: number; clicks: number; impressions: number }
  >();
  for (
    let cursor = period.currentStart.getTime();
    cursor <= period.currentEnd.getTime();
    cursor += DAY_MS
  ) {
    const date = dateText(new Date(cursor));
    series.set(date, { date, sessions: 0, clicks: 0, impressions: 0 });
  }
  const ga4Source = ga4.some((row) => row.pagePath === TOTAL_MARKER)
    ? ga4.filter((row) => row.pagePath === TOTAL_MARKER)
    : ga4;
  for (const row of ga4Source) {
    const item = series.get(dateText(row.date));
    if (item) item.sessions += row.sessions;
  }
  const gscSource = gsc.some(
    (row) => row.page === TOTAL_MARKER && row.query === TOTAL_MARKER,
  )
    ? gsc.filter(
        (row) => row.page === TOTAL_MARKER && row.query === TOTAL_MARKER,
      )
    : gsc;
  for (const row of gscSource) {
    const item = series.get(dateText(row.date));
    if (item) {
      item.clicks += row.clicks;
      item.impressions += row.impressions;
    }
  }
  return [...series.values()];
}

function monthlySeries(
  ga4: Parameters<typeof buildAnalyticsSummary>[2],
  gsc: Parameters<typeof buildAnalyticsSummary>[3],
) {
  const series = new Map<
    string,
    {
      month: string;
      sessions: number;
      views: number;
      clicks: number;
      impressions: number;
      weightedPosition: number;
    }
  >();
  const itemFor = (date: Date) => {
    const month = dateText(date).slice(0, 7);
    const current = series.get(month) ?? {
      month,
      sessions: 0,
      views: 0,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };
    series.set(month, current);
    return current;
  };
  for (const row of ga4) {
    if (row.pagePath === TOTAL_MARKER) continue;
    const item = itemFor(row.date);
    item.sessions += row.sessions;
    item.views += row.views;
  }
  for (const row of gsc) {
    if (row.page === TOTAL_MARKER || row.query === TOTAL_MARKER) continue;
    const item = itemFor(row.date);
    item.clicks += row.clicks;
    item.impressions += row.impressions;
    item.weightedPosition += row.position * row.impressions;
  }
  return [...series.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map(({ weightedPosition, ...item }) => ({
      ...item,
      ctr: safeRatio(item.clicks, item.impressions),
      position: safeRatio(weightedPosition, item.impressions),
    }));
}

function topPages(rows: Parameters<typeof buildAnalyticsSummary>[2]) {
  const pages = new Map<string, { sessions: number; views: number }>();
  for (const row of rows) {
    if (row.pagePath === TOTAL_MARKER) continue;
    const current = pages.get(row.pagePath) ?? { sessions: 0, views: 0 };
    current.sessions += row.sessions;
    current.views += row.views;
    pages.set(row.pagePath, current);
  }
  return [...pages.entries()]
    .map(([pagePath, values]) => ({ pagePath, ...values }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
}

function topQueries(rows: Parameters<typeof buildAnalyticsSummary>[3]) {
  const queries = new Map<
    string,
    { clicks: number; impressions: number; weightedPosition: number }
  >();
  for (const row of rows) {
    if (row.query === TOTAL_MARKER) continue;
    const current = queries.get(row.query) ?? {
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.position * row.impressions;
    queries.set(row.query, current);
  }
  return [...queries.entries()]
    .map(([query, values]) => ({
      query,
      clicks: values.clicks,
      impressions: values.impressions,
      ctr: values.impressions > 0 ? values.clicks / values.impressions : 0,
      position:
        values.impressions > 0
          ? values.weightedPosition / values.impressions
          : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 10);
}

type PublicationForPagePerformance = {
  noteId: string;
  url: string;
  pagePath: string;
  publishedAt: Date;
  note: { versions: Array<{ title: string }> };
};

export function buildPagePerformance(
  connection: { gscSiteUrl: string | null } | null,
  period: ReturnType<typeof reportingPeriod>,
  ga4: Parameters<typeof buildAnalyticsSummary>[2],
  gsc: Parameters<typeof buildAnalyticsSummary>[3],
  publications: PublicationForPagePerformance[],
) {
  type QueryAggregate = {
    query: string;
    clicks: number;
    impressions: number;
  };
  type PageAggregate = {
    pagePath: string;
    url: string | null;
    title: string;
    source: 'I_HERE' | 'BLOG_HISTORY';
    noteId: string | null;
    publishedAt: Date | null;
    sessions: number;
    activeUsers: number;
    views: number;
    engagedSessions: number;
    userEngagementDuration: number;
    keyEvents: number;
    clicks: number;
    impressions: number;
    weightedPosition: number;
    queries: Map<string, QueryAggregate>;
  };

  const currentGa4 = ga4.filter(
    (row) => row.date >= period.currentStart && row.date <= period.currentEnd,
  );
  const currentGsc = gsc.filter(
    (row) => row.date >= period.currentStart && row.date <= period.currentEnd,
  );
  const publicationByPath = new Map(
    publications.map((publication) => [
      normalizedPagePath(publication.pagePath),
      publication,
    ]),
  );
  const pages = new Map<string, PageAggregate>();

  const ensure = (value: string) => {
    const pagePath = normalizedPagePath(value);
    const publication = publicationByPath.get(pagePath);
    if (!publication && !isBlogPage(pagePath)) return null;
    const existing = pages.get(pagePath);
    if (existing) return existing;
    const created: PageAggregate = {
      pagePath,
      url:
        publication?.url ??
        absolutePublicationUrl(pagePath, connection?.gscSiteUrl ?? null),
      title:
        publication?.note.versions[0]?.title ?? titleFromPagePath(pagePath),
      source: publication ? 'I_HERE' : 'BLOG_HISTORY',
      noteId: publication?.noteId ?? null,
      publishedAt: publication?.publishedAt ?? null,
      sessions: 0,
      activeUsers: 0,
      views: 0,
      engagedSessions: 0,
      userEngagementDuration: 0,
      keyEvents: 0,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      queries: new Map(),
    };
    pages.set(pagePath, created);
    return created;
  };

  for (const row of currentGa4) {
    if (row.pagePath === TOTAL_MARKER) continue;
    const page = ensure(row.pagePath);
    if (!page) continue;
    page.sessions += row.sessions;
    page.activeUsers += row.activeUsers;
    page.views += row.views;
    page.engagedSessions += row.engagedSessions;
    page.userEngagementDuration += row.userEngagementDuration;
    page.keyEvents += row.keyEvents;
  }
  for (const row of currentGsc) {
    if (row.page === TOTAL_MARKER) continue;
    const page = ensure(row.page);
    if (!page) continue;
    if (!page.url && /^https?:\/\//i.test(row.page)) {
      try {
        page.url = normalizedPublicationUrl(row.page);
      } catch {
        page.url = null;
      }
    }
    page.clicks += row.clicks;
    page.impressions += row.impressions;
    page.weightedPosition += row.position * row.impressions;
    if (row.query && row.query !== TOTAL_MARKER) {
      const query = page.queries.get(row.query) ?? {
        query: row.query,
        clicks: 0,
        impressions: 0,
      };
      query.clicks += row.clicks;
      query.impressions += row.impressions;
      page.queries.set(row.query, query);
    }
  }

  return [...pages.values()]
    .map((page) => ({
      pagePath: page.pagePath,
      url: page.url,
      title: page.title,
      source: page.source,
      noteId: page.noteId,
      publishedAt: page.publishedAt,
      sessions: page.sessions,
      activeUsers: page.activeUsers,
      views: page.views,
      engagedSessions: page.engagedSessions,
      engagementRate: safeRatio(page.engagedSessions, page.sessions),
      averageEngagementTimeSeconds: safeRatio(
        page.userEngagementDuration,
        page.sessions,
      ),
      keyEvents: page.keyEvents,
      clicks: page.clicks,
      impressions: page.impressions,
      ctr: safeRatio(page.clicks, page.impressions),
      position: safeRatio(page.weightedPosition, page.impressions),
      topQueries: [...page.queries.values()]
        .sort(
          (left, right) =>
            right.clicks - left.clicks || right.impressions - left.impressions,
        )
        .slice(0, 3),
    }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.clicks - left.clicks ||
        right.impressions - left.impressions,
    );
}

function normalizedPagePath(value: string): string {
  try {
    const path = decodeURIComponent(
      new URL(value, 'https://ihere.local').pathname,
    );
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  }
}

function isBlogPage(pagePath: string): boolean {
  return /(^|\/)blog(\/|$)/i.test(pagePath);
}

function titleFromPagePath(pagePath: string): string {
  const slug =
    pagePath.split('/').filter(Boolean).at(-1) ?? 'Artículo del blog';
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./u, (character) => character.toLocaleUpperCase('es-PE'));
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}
