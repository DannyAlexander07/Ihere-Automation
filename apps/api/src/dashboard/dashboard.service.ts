import { Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import {
  DuplicateResolution,
  EvaluationStatus,
  EvaluationVerdict,
  NoteStatus,
  TitleStatus,
} from '../generated/prisma/client';

const activeTitleStatuses = [
  TitleStatus.DRAFT,
  TitleStatus.PROPOSED,
  TitleStatus.EVALUATING,
  TitleStatus.CHANGES_REQUESTED,
  TitleStatus.APPROVED,
] as const;

const activeNoteStatuses = [
  NoteStatus.DRAFT,
  NoteStatus.GENERATING,
  NoteStatus.QA_QUEUED,
  NoteStatus.QA_RUNNING,
  NoteStatus.CHANGES_REQUESTED,
  NoteStatus.READY_FOR_REVIEW,
] as const;

const titleActivityActions = [
  'title.created',
  'title.updated',
  'title.submitted',
  'title.evaluation.queued',
  'title.decision.approve',
  'title.decision.reject',
  'title.decision.request_changes',
  'title.decision.resolve_duplicate',
] as const;

const noteActivityActions = [
  'note.created_from_approved_title',
  'note.version.created',
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(principal: AuthPrincipal) {
    const titleClientIds = this.clientIdsFor(principal, 'titles.read');
    const noteClientIds = this.clientIdsFor(principal, 'notes.read');
    const analyticsClientIds = this.clientIdsFor(principal, 'analytics.read');
    const [titles, notes, activity, analyticsConnections] =
      await this.prisma.$transaction([
        this.prisma.titleProposal.findMany({
          where: {
            tenantId: principal.tenantId,
            status: { in: [...activeTitleStatuses] },
            ...(titleClientIds.all
              ? {}
              : { clientId: { in: titleClientIds.ids } }),
          },
          select: {
            id: true,
            status: true,
            currentVersion: true,
            duplicateResolution: true,
            evaluations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                version: true,
                status: true,
                verdict: true,
              },
            },
          },
          take: 1_000,
        }),
        this.prisma.noteDocument.findMany({
          where: {
            tenantId: principal.tenantId,
            status: { in: [...activeNoteStatuses] },
            ...(noteClientIds.all
              ? {}
              : { clientId: { in: noteClientIds.ids } }),
          },
          select: { id: true, status: true },
          take: 1_000,
        }),
        this.prisma.auditLog.findMany({
          where: {
            tenantId: principal.tenantId,
            OR: [
              {
                action: { in: [...titleActivityActions] },
                ...(titleClientIds.all
                  ? { clientId: { not: null } }
                  : { clientId: { in: titleClientIds.ids } }),
              },
              {
                action: { in: [...noteActivityActions] },
                ...(noteClientIds.all
                  ? { clientId: { not: null } }
                  : { clientId: { in: noteClientIds.ids } }),
              },
            ],
          },
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            createdAt: true,
            user: { select: { displayName: true } },
            client: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.analyticsConnection.findMany({
          where: {
            tenantId: principal.tenantId,
            ...(analyticsClientIds.all
              ? {}
              : { clientId: { in: analyticsClientIds.ids } }),
          },
          select: {
            status: true,
            lastSyncCompletedAt: true,
          },
          take: 1_000,
        }),
      ]);

    const currentEvaluation = (title: (typeof titles)[number]) => {
      const evaluation = title.evaluations[0];
      return evaluation?.version === title.currentVersion ? evaluation : null;
    };
    const titleReview = titles.filter(
      (title) =>
        title.status === TitleStatus.PROPOSED ||
        title.status === TitleStatus.EVALUATING,
    ).length;
    const titleQualityAlerts = titles.filter((title) => {
      const evaluation = currentEvaluation(title);
      return (
        evaluation?.status === EvaluationStatus.FAILED ||
        evaluation?.verdict === EvaluationVerdict.BLOCK ||
        evaluation?.verdict === EvaluationVerdict.REVIEW
      );
    }).length;
    const titleApprovals = titles.filter((title) => {
      const evaluation = currentEvaluation(title);
      return (
        title.status === TitleStatus.PROPOSED &&
        evaluation?.status === EvaluationStatus.COMPLETED &&
        evaluation.verdict === EvaluationVerdict.PASS &&
        title.duplicateResolution !== DuplicateResolution.PENDING
      );
    }).length;
    const noteQualityAlerts = notes.filter(
      (note) => note.status === NoteStatus.CHANGES_REQUESTED,
    ).length;
    const noteApprovals = notes.filter(
      (note) => note.status === NoteStatus.READY_FOR_REVIEW,
    ).length;

    const workflow = {
      titles: titleReview,
      drafting: notes.filter(
        (note) =>
          note.status === NoteStatus.DRAFT ||
          note.status === NoteStatus.GENERATING,
      ).length,
      quality: notes.filter(
        (note) =>
          note.status === NoteStatus.QA_QUEUED ||
          note.status === NoteStatus.QA_RUNNING ||
          note.status === NoteStatus.CHANGES_REQUESTED,
      ).length,
      review: noteApprovals,
    };
    const connectedAnalytics = analyticsConnections.filter(
      (connection) => connection.status === 'CONNECTED',
    );
    const analyticsStatus =
      connectedAnalytics.length > 0
        ? ('CONNECTED' as const)
        : analyticsConnections.length > 0
          ? ('ERROR' as const)
          : ('NOT_CONFIGURED' as const);
    const latestAnalyticsSync = connectedAnalytics
      .map((connection) => connection.lastSyncCompletedAt)
      .filter((date): date is Date => date !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0];

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        titlesToReview: titleReview,
        notesInProgress: notes.length,
        qualityAlerts: titleQualityAlerts + noteQualityAlerts,
        approvalsPending: titleApprovals + noteApprovals,
      },
      workflow: {
        ...workflow,
        active: Object.values(workflow).reduce(
          (total, value) => total + value,
          0,
        ),
      },
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        actorName: item.user?.displayName ?? 'Sistema I HERE',
        clientName: item.client?.name ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      analytics: {
        status: analyticsStatus,
        provider:
          analyticsConnections.length > 0
            ? 'Google Analytics 4 + Search Console'
            : null,
        message:
          analyticsStatus === 'CONNECTED'
            ? `${connectedAnalytics.length} cliente${connectedAnalytics.length === 1 ? '' : 's'} conectado${connectedAnalytics.length === 1 ? '' : 's'}${latestAnalyticsSync ? `; última sincronización ${latestAnalyticsSync.toISOString()}` : ''}.`
            : analyticsStatus === 'ERROR'
              ? 'La conexión con Google requiere atención o una nueva autorización.'
              : 'GA4 y Search Console todavía no tienen una conexión autorizada para los clientes visibles.',
      },
    };
  }

  private clientIdsFor(principal: AuthPrincipal, permission: string) {
    if (principal.tenantPermissions.includes(permission)) {
      return { all: true, ids: [] as string[] };
    }
    return {
      all: false,
      ids: Object.entries(principal.clientPermissions)
        .filter(([, permissions]) => permissions.includes(permission))
        .map(([clientId]) => clientId),
    };
  }
}
