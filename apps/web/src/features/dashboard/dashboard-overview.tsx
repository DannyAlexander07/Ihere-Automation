"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FileText,
  Lightbulb,
  PanelsTopLeft,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ActivityPanel } from "@/components/dashboard/activity-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PerformanceCard } from "@/components/dashboard/performance-card";
import { WorkflowBoard } from "@/components/dashboard/workflow-board";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/api-client";

export type DashboardSummary = {
  generatedAt: string;
  metrics: {
    titlesToReview: number;
    notesInProgress: number;
    qualityAlerts: number;
    approvalsPending: number;
  };
  workflow: {
    titles: number;
    drafting: number;
    quality: number;
    review: number;
    active: number;
  };
  activity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorName: string;
    clientName: string | null;
    createdAt: string;
  }>;
  analytics: {
    status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR";
    provider: string | null;
    message: string;
  };
};

export function DashboardOverview() {
  const { apiFetch } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await apiFetch<DashboardSummary>("dashboard/summary"));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const nextSummary = await apiFetch<DashboardSummary>("dashboard/summary");
        if (!cancelled) setSummary(nextSummary);
      } catch (reason) {
        if (!cancelled) setError(messageFrom(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  return (
    <div className="space-y-4 min-[1920px]:space-y-6">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
            <PanelsTopLeft className="size-3.5" />Centro de operaciones
          </div>
          <h1 className="text-balance text-xl font-semibold sm:text-2xl">Resumen de trabajo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Información operativa registrada en I HERE, sin cifras de demostración.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/automatizacion/titulos">Abrir propuestas <ArrowRight /></Link>
        </Button>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>No pudimos cargar el panel</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw />Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading || !summary ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 min-[1920px]:gap-4" aria-label="Indicadores del flujo">
            <MetricCard label="Títulos por revisar" value={String(summary.metrics.titlesToReview)} detail="Pendientes visibles para tu acceso" icon={Lightbulb} />
            <MetricCard label="Notas en proceso" value={String(summary.metrics.notesInProgress)} detail="Expedientes editoriales activos" icon={FileText} tone="blue" />
            <MetricCard label="Alertas de calidad" value={String(summary.metrics.qualityAlerts)} detail="Revisiones o cambios requeridos" icon={ClipboardCheck} tone="pink" />
            <MetricCard label="Aprobaciones pendientes" value={String(summary.metrics.approvalsPending)} detail="Listas para decisión humana" icon={ShieldCheck} tone="green" />
          </section>

          <WorkflowBoard workflow={summary.workflow} generatedAt={summary.generatedAt} />

          <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
            <PerformanceCard analytics={summary.analytics} />
            <ActivityPanel activity={summary.activity} />
          </section>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Cargando resumen operativo" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
