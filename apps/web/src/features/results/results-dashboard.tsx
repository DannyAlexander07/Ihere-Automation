"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  CloudCog,
  ExternalLink,
  Eye,
  FileCheck2,
  Link2,
  Lightbulb,
  LoaderCircle,
  MousePointerClick,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Unplug,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { hasClientPermission } from "@/features/auth/permissions";
import { ApiError } from "@/lib/api/api-client";
import { MonthlyPerformanceTable, TrendChart } from "./results-portal";
import type { ApiNoteSummary } from "@/features/notes/types";
import type {
  AnalyticsClient,
  AnalyticsConnectionView,
  AnalyticsSources,
  AnalyticsSummary,
  ContentPublication,
  MetricComparison,
  ResultsLink,
} from "./types";
import { buildArticleInsight, publicationMonthKey } from "./article-insights";
import { ArticlePerformanceReport } from "./article-performance-report";

type BusyAction =
  | "connect"
  | "configure"
  | "sync"
  | "link"
  | "revoke"
  | "publication"
  | null;

export function ResultsDashboard() {
  const { apiFetch, user } = useAuth();
  const [clients, setClients] = useState<AnalyticsClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [connection, setConnection] = useState<AnalyticsConnectionView | null>(
    null,
  );
  const [links, setLinks] = useState<ResultsLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const [sources, setSources] = useState<AnalyticsSources | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [publications, setPublications] = useState<ContentPublication[]>([]);
  const [publicationNotes, setPublicationNotes] = useState<ApiNoteSummary[]>([]);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [publicationNoteId, setPublicationNoteId] = useState("");
  const [publicationUrl, setPublicationUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [period, setPeriod] = useState<"7" | "28" | "60" | "90" | "FEB_JUL_2026">("28");
  const [publicationMonth, setPublicationMonth] = useState("ALL");

  const canManage = hasClientPermission(
    user,
    "analytics.manage",
    selectedClientId,
  );
  const canManageLinks = hasClientPermission(
    user,
    "results_links.manage",
    selectedClientId,
  );
  const resultsReady = Boolean(
    connection?.connected &&
      connection.connection?.lastSyncCompletedAt &&
      (summary?.configured.ga4 || summary?.configured.gsc),
  );
  const fetchClientData = useCallback(
    async (clientId: string, includeLinks: boolean) => {
      const [
        nextConnection,
        nextSummary,
        nextLinks,
        nextPublications,
        nextPublicationNotes,
      ] = await Promise.all([
        apiFetch<AnalyticsConnectionView>(`analytics/connections/${clientId}`),
        apiFetch<AnalyticsSummary>(
          period === "FEB_JUL_2026"
            ? `analytics/summary?clientId=${clientId}&startDate=2026-02-01&endDate=2026-07-31`
            : `analytics/summary?clientId=${clientId}&days=${period}`,
        ),
        includeLinks
          ? apiFetch<ResultsLink[]>(`results-links?clientId=${clientId}`)
          : Promise.resolve([]),
        apiFetch<ContentPublication[]>(
          `analytics/publications?clientId=${clientId}`,
        ),
        hasClientPermission(user, "analytics.manage", clientId)
          ? apiFetch<ApiNoteSummary[]>(
              `notes?clientId=${clientId}&status=EXPORTED`,
            )
          : Promise.resolve([]),
      ]);
      return {
        nextConnection,
        nextSummary,
        nextLinks,
        nextPublications,
        nextPublicationNotes,
      };
    },
    [apiFetch, period, user],
  );

  const publicationMonths = useMemo(
    () => [...new Set((summary?.publicationPerformance ?? []).map((item) => publicationMonthKey(item.publishedAt)))].toSorted().reverse(),
    [summary],
  );
  const visiblePublicationPerformance = useMemo(
    () => (summary?.publicationPerformance ?? []).filter((item) => publicationMonth === "ALL" || publicationMonthKey(item.publishedAt) === publicationMonth),
    [publicationMonth, summary],
  );

  const applyClientData = useCallback(
    ({
      nextConnection,
      nextSummary,
      nextLinks,
      nextPublications,
      nextPublicationNotes,
    }: Awaited<ReturnType<typeof fetchClientData>>) => {
      setConnection(nextConnection);
      setSummary(nextSummary);
      setLinks(nextLinks);
      setPublications(nextPublications);
      setPublicationNotes(nextPublicationNotes);
      setGa4PropertyId(nextConnection.connection?.ga4PropertyId ?? "");
      setGscSiteUrl(nextConnection.connection?.gscSiteUrl ?? "");
      setSources(null);
    },
    [],
  );

  const loadClientData = useCallback(async () => {
    if (!selectedClientId) return;
    setLoading(true);
    setError(null);
    try {
      applyClientData(await fetchClientData(selectedClientId, canManageLinks));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setLoading(false);
    }
  }, [applyClientData, canManageLinks, fetchClientData, selectedClientId]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const available =
          await apiFetch<AnalyticsClient[]>("analytics/clients");
        if (cancelled) return;
        setClients(available);
        setSelectedClientId((current) =>
          available.some((item) => item.id === current)
            ? current
            : (available[0]?.id ?? ""),
        );
        if (!available.length) setLoading(false);
      } catch (reason) {
        if (cancelled) return;
        setError(messageFrom(reason));
        setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  useEffect(() => {
    if (!selectedClientId) return;
    let cancelled = false;
    const initialize = async () => {
      try {
        const data = await fetchClientData(selectedClientId, canManageLinks);
        if (cancelled) return;
        applyClientData(data);
        setError(null);
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
  }, [applyClientData, canManageLinks, fetchClientData, selectedClientId]);

  const connectGoogle = async () => {
    setBusy("connect");
    setError(null);
    try {
      const response = await apiFetch<{ authorizationUrl: string }>(
        "analytics/google/oauth/start",
        {
          method: "POST",
          body: JSON.stringify({
            clientId: selectedClientId,
            returnPath: "/automatizacion/resumen",
          }),
        },
      );
      window.location.assign(response.authorizationUrl);
    } catch (reason) {
      setError(messageFrom(reason));
      setBusy(null);
    }
  };

  const saveConfiguration = async () => {
    if (!ga4PropertyId.trim() && !gscSiteUrl.trim()) {
      setError(
        "Configura al menos una propiedad de GA4 o un sitio de Search Console.",
      );
      return;
    }
    setBusy("configure");
    setError(null);
    try {
      await apiFetch(`analytics/connections/${selectedClientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(ga4PropertyId.trim()
            ? { ga4PropertyId: ga4PropertyId.trim() }
            : {}),
          ...(gscSiteUrl.trim() ? { gscSiteUrl: gscSiteUrl.trim() } : {}),
        }),
      });
      setConfigurationOpen(false);
      setNotice("Configuración analítica guardada.");
      await loadClientData();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  const openConfiguration = async () => {
    setConfigurationOpen(true);
    if (!connection?.connection || sources || sourcesLoading) return;
    setSourcesLoading(true);
    setError(null);
    try {
      setSources(
        await apiFetch<AnalyticsSources>(
          `analytics/connections/${selectedClientId}/sources`,
        ),
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setSourcesLoading(false);
    }
  };

  const synchronize = async () => {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const previousCompletion = connection?.connection?.lastSyncCompletedAt;
      await apiFetch(`analytics/connections/${selectedClientId}/sync`, {
        method: "POST",
        body: "{}",
      });
      setNotice(
        "La sincronización empezó en segundo plano. Puedes seguir trabajando mientras termina.",
      );
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(3_000);
        const nextConnection = await apiFetch<AnalyticsConnectionView>(
          `analytics/connections/${selectedClientId}`,
        );
        const completedAt = nextConnection.connection?.lastSyncCompletedAt;
        if (completedAt && completedAt !== previousCompletion) {
          await loadClientData();
          setNotice("GA4 y Search Console se sincronizaron correctamente.");
          return;
        }
      }
      setNotice(
        "La sincronización continúa en segundo plano. Los datos aparecerán al actualizar el resumen.",
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  const createLink = async () => {
    if (recipientName.trim().length < 2 || !recipientEmail.includes("@")) {
      setError("Completa el nombre y un correo válido para el destinatario.");
      return;
    }
    setBusy("link");
    setError(null);
    try {
      const created = await apiFetch<ResultsLink & { url: string }>(
        "results-links",
        {
          method: "POST",
          body: JSON.stringify({
            clientId: selectedClientId,
            recipientName: recipientName.trim(),
            recipientEmail: recipientEmail.trim(),
            expiresInDays: 30,
            reportStartDate: summary?.period.startDate,
            reportEndDate: summary?.period.endDate,
          }),
        },
      );
      setCreatedUrl(created.url);
      setRecipientName("");
      setRecipientEmail("");
      setLinks((current) => [created, ...current]);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  const revokeLink = async (id: string) => {
    setBusy("revoke");
    setError(null);
    try {
      await apiFetch(`results-links/${id}/revoke`, {
        method: "PATCH",
        body: "{}",
      });
      setLinks((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "REVOKED" } : item,
        ),
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  const createPublication = async () => {
    if (!publicationNoteId || !publicationUrl.trim() || !publishedAt) {
      setError("Selecciona la nota, indica su URL real y la fecha de publicación.");
      return;
    }
    setBusy("publication");
    setError(null);
    try {
      await apiFetch("analytics/publications", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedClientId,
          noteId: publicationNoteId,
          url: publicationUrl.trim(),
          publishedAt,
        }),
      });
      setPublicationOpen(false);
      setPublicationNoteId("");
      setPublicationUrl("");
      setPublishedAt("");
      setNotice("La URL publicada quedó confirmada y entró al seguimiento de 30, 60 y 90 días.");
      await loadClientData();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  const confirmPublication = async (publication: ContentPublication) => {
    setBusy("publication");
    setError(null);
    try {
      await apiFetch(`analytics/publications/${publication.id}/confirm`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setNotice("La URL detectada quedó confirmada para su medición editorial.");
      await loadClientData();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 min-[1920px]:space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_92%_15%,rgba(93,216,193,.19),transparent_24%),radial-gradient(circle_at_76%_0%,rgba(22,142,234,.13),transparent_25%),#fff] p-4 shadow-card sm:p-5 xl:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <BarChart3 className="size-4" />
              Automatización de notas
            </p>
            <h1 className="mt-2 font-heading text-2xl font-semibold sm:text-3xl">
              Resumen ejecutivo por cliente
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Consulta GA4 y Search Console, compara periodos y controla los
              enlaces que recibe cada cliente.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:min-w-[420px] sm:grid-cols-[1fr_150px]">
          <div className="relative min-w-0">
            <label
              htmlFor="analytics-client"
              className="mb-1.5 block text-xs font-semibold text-muted-foreground"
            >
              Cliente
            </label>
            <select
              id="analytics-client"
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
              className="h-9 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm font-medium shadow-sm"
              disabled={!clients.length}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 size-4 text-muted-foreground" />
          </div>
          <div className="relative min-w-0">
            <label htmlFor="analytics-period" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Periodo</label>
            <select id="analytics-period" value={period} onChange={(event) => setPeriod(event.target.value as typeof period)} className="h-9 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm font-medium shadow-sm">
              <option value={7}>7 días</option>
              <option value={28}>28 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
              <option value="FEB_JUL_2026">Informe feb.–jul. 2026</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 size-4 text-muted-foreground" />
          </div>
          </div>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Necesitamos revisar algo</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadClientData()}
            >
              <RefreshCw />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <Check />
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {!clients.length && !loading ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Unplug className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-lg font-semibold">
              No tienes clientes analíticos habilitados
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Un administrador debe asignarte acceso a analytics.read.
            </p>
          </CardContent>
        </Card>
      ) : loading || !summary || !connection ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${connection.connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                >
                  <CloudCog />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading font-semibold">
                      Conexión de datos
                    </h2>
                    <Badge
                      variant={connection.connected ? "secondary" : "outline"}
                    >
                      {connection.connected ? "Conectada" : "Pendiente"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {connection.connection?.googleAccountEmail ||
                      "Conecta una cuenta Google con acceso autorizado."}
                  </p>
                </div>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void connectGoogle()}
                    disabled={busy !== null || !connection.enabled}
                  >
                    {busy === "connect" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ExternalLink />
                    )}
                    {connection.connected ? "Reconectar" : "Conectar Google"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void openConfiguration()}
                    disabled={!connection.connection}
                  >
                    <Settings2 />
                    Configurar
                  </Button>
                  <Button
                    onClick={() => void synchronize()}
                    disabled={
                      !connection.connected ||
                      (!summary.configured.ga4 && !summary.configured.gsc) ||
                      busy !== null
                    }
                  >
                    {busy === "sync" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Sincronizar
                  </Button>
                </div>
              ) : null}
            </div>
            {canManageLinks ? (
              <Button
                className="h-auto min-h-12 rounded-2xl px-5"
                disabled={!resultsReady}
                title={
                  resultsReady
                    ? "Crear un enlace del periodo seleccionado"
                    : "Conecta, configura y sincroniza Google antes de compartir el informe"
                }
                onClick={() => {
                  setCreatedUrl("");
                  setLinkOpen(true);
                }}
              >
                <Link2 />
                Crear enlace para cliente
              </Button>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
            <MetricTile
              label="Sesiones"
              value={summary.metrics.sessions}
              icon={BarChart3}
            />
            <MetricTile
              label="Usuarios"
              value={summary.metrics.activeUsers}
              icon={UsersRound}
            />
            <MetricTile
              label="Vistas"
              value={summary.metrics.views}
              icon={Eye}
            />
            <MetricTile
              label="Clics"
              value={summary.metrics.clicks}
              icon={MousePointerClick}
            />
            <MetricTile
              label="Impresiones"
              value={summary.metrics.impressions}
              icon={Search}
            />
            <MetricTile
              label="CTR"
              value={summary.metrics.ctr}
              icon={MousePointerClick}
              percent
            />
            <MetricTile
              label="Posición"
              value={summary.metrics.averagePosition}
              icon={Search}
              decimal
            />
            <MetricTile
              label="Eventos"
              value={summary.metrics.keyEvents}
              icon={ShieldCheck}
              decimal
            />
            <MetricTile
              label="Tiempo medio"
              value={summary.metrics.averageEngagementTime}
              icon={Clock3}
              duration
            />
          </section>

          <ArticlePerformanceReport items={summary.pagePerformance} />

          <MonthlyPerformanceTable summary={summary} />

          <section className="grid gap-4 2xl:grid-cols-[1.4fr_.75fr]">
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <CardTitle>Tendencia de los últimos {summary.period.days} días</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Comparación visual de sesiones y clics con escalas
                  independientes.
                </p>
              </CardHeader>
              <CardContent>
                <TrendChart summary={summary} />
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <CardTitle>Consultas destacadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.topQueries.length ? (
                  summary.topQueries.slice(0, 8).map((item, index) => (
                    <div
                      key={item.query}
                      className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <span className="text-xs font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span
                        className="truncate text-sm font-medium"
                        title={item.query}
                      >
                        {item.query}
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        {formatNumber(item.clicks)}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <CardTitle>Páginas con mayor actividad</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-semibold">Página</th>
                        <th className="pb-2 text-right font-semibold">
                          Sesiones
                        </th>
                        <th className="pb-2 text-right font-semibold">
                          Vistas
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.topPages.map((item) => (
                        <tr key={item.pagePath}>
                          <td
                            className="max-w-[620px] truncate py-3 pr-4 font-medium"
                            title={item.pagePath}
                          >
                            {item.pagePath}
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            {formatNumber(item.sessions)}
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            {formatNumber(item.views)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!summary.topPages.length ? <Empty /> : null}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <CardTitle>Enlaces compartidos</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Acceso, vigencia y trazabilidad.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {links.slice(0, 6).map((link) => (
                  <div key={link.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {link.recipientName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {link.recipientEmail}
                        </p>
                      </div>
                      <Badge
                        variant={
                          link.status === "ACTIVE" ? "secondary" : "outline"
                        }
                      >
                        {link.status === "ACTIVE" ? "Activo" : "Revocado"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{link.viewCount} vistas</span>
                      {link.status === "ACTIVE" ? (
                        <button
                          className="font-semibold text-destructive hover:underline"
                          onClick={() => void revokeLink(link.id)}
                          disabled={busy === "revoke"}
                        >
                          Revocar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!links.length ? <Empty /> : null}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="rounded-2xl border-primary/15 shadow-card">
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-amber-500" />Aprendizajes por nota</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Lecturas orientativas basadas en los datos disponibles; no sustituyen la revisión de indexación, medición ni contexto editorial.</p>
                </div>
                <select value={publicationMonth} onChange={(event) => setPublicationMonth(event.target.value)} className="h-9 rounded-lg border bg-white px-3 text-sm" aria-label="Filtrar publicaciones por mes">
                  <option value="ALL">Todos los meses</option>
                  {publicationMonths.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
                </select>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-2">
                {visiblePublicationPerformance.map((publication) => {
                  const insight = buildArticleInsight(publication);
                  return (
                    <article key={publication.id} className="rounded-xl border bg-background p-4">
                      <p className="line-clamp-2 text-sm font-semibold">{publication.note.versions[0]?.title ?? "Nota publicada"}</p>
                      <div className="mt-3 rounded-xl bg-secondary/45 p-3">
                        <p className={`text-xs font-bold ${insight.tone === "opportunity" ? "text-amber-700" : insight.tone === "positive" ? "text-emerald-700" : "text-primary"}`}>{insight.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.detail}</p>
                      </div>
                    </article>
                  );
                })}
                {!visiblePublicationPerformance.length ? <div className="lg:col-span-2"><Empty /></div> : null}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="rounded-2xl shadow-card">
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    Publicaciones y cortes de 30, 60 y 90 días
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Métricas acumuladas por URL confirmada. Las coincidencias
                    automáticas nunca se aceptan sin revisión humana.
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="outline"
                    onClick={() => setPublicationOpen(true)}
                  >
                    <Plus />
                    Registrar URL publicada
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {publications
                  .filter((item) => item.status === "PENDING_CONFIRMATION")
                  .map((publication) => (
                    <div
                      key={publication.id}
                      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {publication.note.versions[0]?.title ?? publication.url}
                        </p>
                        <p className="truncate text-xs text-amber-900/75">
                          Detectada: {publication.url}
                        </p>
                      </div>
                      {canManage ? (
                        <Button
                          size="sm"
                          onClick={() => void confirmPublication(publication)}
                          disabled={busy === "publication"}
                        >
                          <Check />
                          Confirmar coincidencia
                        </Button>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </div>
                  ))}

                {visiblePublicationPerformance.map((publication) => (
                  <article
                    key={publication.id}
                    className="rounded-xl border bg-background/50 p-3 sm:p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileCheck2 className="size-4 text-emerald-600" />
                          <p className="line-clamp-2 text-sm font-semibold">
                            {publication.note.versions[0]?.title ??
                              "Nota publicada"}
                          </p>
                          <Badge variant="outline">
                            {publication.source === "AUTO_DETECTED"
                              ? "Detectada y confirmada"
                              : "Registrada"}
                          </Badge>
                        </div>
                        <a
                          href={publication.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-xs text-primary hover:underline"
                        >
                          {publication.url}
                        </a>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Publicada {formatDate(publication.publishedAt)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {publication.milestones.map((milestone) => (
                        <div
                          key={milestone.days}
                          className="rounded-xl border bg-white p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">
                              Corte {milestone.days} días
                            </p>
                            <Badge
                              variant={
                                milestone.status === "COMPLETE"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {milestone.status === "COMPLETE"
                                ? "Completo"
                                : "En curso"}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1 text-center sm:grid-cols-3">
                            <MilestoneMetric
                              label="Sesiones"
                              value={milestone.ga4.sessions}
                            />
                            <MilestoneMetric
                              label="Clics"
                              value={milestone.gsc.clicks}
                            />
                            <MilestoneMetric
                              label="Impres."
                              value={milestone.gsc.impressions}
                            />
                            <MilestoneMetric label="CTR" value={milestone.gsc.ctr} percent />
                            <MilestoneMetric label="Interacción" value={milestone.ga4.sessions ? milestone.ga4.engagedSessions / milestone.ga4.sessions : 0} percent />
                            <MilestoneMetric label="Eventos" value={milestone.ga4.keyEvents} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                {!visiblePublicationPerformance.length && !publications.some((item) => item.status === "PENDING_CONFIRMATION") ? (
                  <div className="py-8 text-center">
                    <CalendarDays className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-2 text-sm font-semibold">
                      Aún no hay URLs publicadas confirmadas
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Se detectarán al sincronizar o podrán registrarse cuando
                      Adecco publique una nota exportada.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <p className="rounded-xl border bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">
            {summary.methodology.note} Última sincronización:{" "}
            {summary.lastSyncCompletedAt
              ? formatDateTime(summary.lastSyncCompletedAt)
              : "pendiente"}
            .
          </p>
        </>
      )}

      <Dialog open={configurationOpen} onOpenChange={setConfigurationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar fuentes</DialogTitle>
            <DialogDescription>
              Usa el ID numérico de la propiedad GA4 y la URL exacta verificada
              en Search Console.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {sourcesLoading ? (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Consultando las propiedades disponibles en modo de solo lectura…
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ga4-property">ID de propiedad GA4</Label>
              {sources?.ga4Properties.length ? (
                <select
                  id="ga4-property"
                  value={ga4PropertyId}
                  onChange={(event) => setGa4PropertyId(event.target.value)}
                  className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                >
                  <option value="">Selecciona una propiedad</option>
                  {sources.ga4Properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.displayName} · {property.accountName} (
                      {property.id})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="ga4-property"
                  inputMode="numeric"
                  placeholder="123456789"
                  value={ga4PropertyId}
                  onChange={(event) =>
                    setGa4PropertyId(event.target.value.replace(/\D/g, ""))
                  }
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gsc-site">Sitio de Search Console</Label>
              {sources?.gscSites.length ? (
                <select
                  id="gsc-site"
                  value={gscSiteUrl}
                  onChange={(event) => setGscSiteUrl(event.target.value)}
                  className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                >
                  <option value="">Selecciona un sitio verificado</option>
                  {sources.gscSites.map((site) => (
                    <option key={site.siteUrl} value={site.siteUrl}>
                      {site.siteUrl} · {site.permissionLevel}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="gsc-site"
                  placeholder="sc-domain:adecco.com o https://…"
                  value={gscSiteUrl}
                  onChange={(event) => setGscSiteUrl(event.target.value)}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfigurationOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void saveConfiguration()}
              disabled={busy === "configure"}
            >
              {busy === "configure" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publicationOpen} onOpenChange={setPublicationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar URL publicada</DialogTitle>
            <DialogDescription>
              Confirma únicamente la dirección real de una nota ya exportada.
              I HERE consultará las métricas existentes sin modificar GA4,
              Search Console ni el sitio de Adecco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="publication-note">Nota exportada</Label>
              <select
                id="publication-note"
                value={publicationNoteId}
                onChange={(event) => setPublicationNoteId(event.target.value)}
                autoComplete="off"
                className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                <option value="">Selecciona una nota</option>
                {publicationNotes.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.versions[0]?.title ?? `Nota v${note.currentVersion}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publication-url">URL pública</Label>
              <Input
                id="publication-url"
                type="url"
                value={publicationUrl}
                onChange={(event) => setPublicationUrl(event.target.value)}
                autoComplete="off"
                placeholder="https://www.adecco.com/es-pe/blog/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="published-at">Fecha de publicación</Label>
              <Input
                id="published-at"
                type="date"
                value={publishedAt}
                onChange={(event) => setPublishedAt(event.target.value)}
                autoComplete="off"
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPublicationOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void createPublication()}
              disabled={busy === "publication" || !publicationNotes.length}
            >
              {busy === "publication" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              Confirmar publicación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compartir portal de resultados</DialogTitle>
            <DialogDescription>
              El enlace será de solo lectura, vencerá en 30 días y podrá
              revocarse de inmediato.
            </DialogDescription>
          </DialogHeader>
          {createdUrl ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/40 p-3 text-xs break-all">
                {createdUrl}
              </div>
              <Button className="w-full" onClick={() => void copy(createdUrl)}>
                <Clipboard />
                Copiar enlace seguro
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipient-name">Nombre del destinatario</Label>
                <Input
                  id="recipient-name"
                  autoComplete="off"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient-email">Correo del destinatario</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  autoComplete="off"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {createdUrl ? (
              <Button onClick={() => setLinkOpen(false)}>Listo</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setLinkOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void createLink()}
                  disabled={busy === "link"}
                >
                  {busy === "link" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Link2 />
                  )}
                  Crear enlace
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function MetricTile({
  label,
  value,
  icon: Icon,
  percent,
  decimal,
  duration,
}: {
  label: string;
  value: MetricComparison;
  icon: typeof BarChart3;
  percent?: boolean;
  decimal?: boolean;
  duration?: boolean;
}) {
  const display = duration
    ? formatDuration(value.current)
    : percent
    ? `${(value.current * 100).toFixed(1)}%`
    : decimal
      ? value.current.toLocaleString("es-PE", { maximumFractionDigits: 1 })
      : formatNumber(value.current);
  return (
    <div className="min-w-0 rounded-2xl border bg-white p-3 shadow-card">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums">
        {display}
      </p>
      <p
        className={`mt-1 text-[10px] font-semibold ${value.changePercent === null || value.changePercent === 0 ? "text-muted-foreground" : value.favorable ? "text-emerald-600" : "text-rose-600"}`}
      >
        {value.changePercent === null
          ? "Sin base"
          : value.changePercent === 0
            ? "Sin cambio"
            : `${value.changePercent > 0 ? "+" : ""}${value.changePercent.toFixed(1)}%`}
      </p>
    </div>
  );
}

function MilestoneMetric({ label, value, percent = false }: { label: string; value: number; percent?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/55 px-2 py-1.5">
      <p className="text-xs font-semibold tabular-nums">
        {percent ? `${(value * 100).toFixed(1)}%` : formatNumber(value)}
      </p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
function Empty() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      Aún no hay datos disponibles.
    </p>
  );
}
function formatNumber(value: number) {
  return Math.round(value).toLocaleString("es-PE");
}
function formatDuration(value: number) {
  if (!value) return "—";
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
async function copy(value: string) {
  await navigator.clipboard.writeText(value);
}
