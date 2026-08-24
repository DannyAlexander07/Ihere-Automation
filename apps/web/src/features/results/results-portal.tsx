"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Eye,
  FileCheck2,
  MousePointerClick,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AnalyticsSummary,
  MetricComparison,
  PublicResults,
} from "./types";
import { ArticlePerformanceReport } from "./article-performance-report";

export function ResultsPortal({ data }: { data: PublicResults | null }) {
  if (!data) return <Unavailable />;
  const { summary } = data;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_8%_8%,rgba(22,142,234,.11),transparent_26%),radial-gradient(circle_at_92%_18%,rgba(93,216,193,.16),transparent_23%),#f7f9fb] px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-[1560px] space-y-4 lg:space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white/90 p-4 shadow-card backdrop-blur sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#168eea] to-[#22b9a3] font-heading text-sm font-bold text-white shadow-lg shadow-primary/15">
              I·H
            </span>
            <div>
              <p className="font-heading text-sm font-semibold tracking-[0.18em]">
                I HERE
              </p>
              <p className="text-xs text-muted-foreground">
                Portal de resultados
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{data.client.name}</Badge>
            <Badge variant="outline" className="gap-1">
              <CalendarDays />
              Hasta {formatDate(data.expiresAt)}
            </Badge>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border bg-white p-5 shadow-card sm:p-7 lg:p-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="size-4" />
                Resumen ejecutivo
              </p>
              <h1 className="mt-2 max-w-3xl text-balance font-heading text-2xl font-semibold sm:text-3xl lg:text-4xl">
                Resultados digitales de {data.client.name}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Hola, {data.recipientName}. Aquí encontrarás el desempeño
                consolidado de GA4 y Search Console.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">
                Periodo analizado
              </span>
              {formatDate(summary.period.startDate)} –{" "}
              {formatDate(summary.period.endDate)}
            </div>
          </div>
        </section>

        {!summary.connected ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Las fuentes de resultados todavía se están configurando. Este enlace
            se actualizará automáticamente cuando la sincronización esté
            disponible.
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
          <PublicMetric
            label="Sesiones"
            value={summary.metrics.sessions}
            icon={BarChart3}
          />
          <PublicMetric
            label="Usuarios"
            value={summary.metrics.activeUsers}
            icon={UsersRound}
          />
          <PublicMetric
            label="Vistas"
            value={summary.metrics.views}
            icon={Eye}
          />
          <PublicMetric
            label="Clics"
            value={summary.metrics.clicks}
            icon={MousePointerClick}
          />
          <PublicMetric
            label="Impresiones"
            value={summary.metrics.impressions}
            icon={Search}
          />
          <PublicMetric
            label="CTR"
            value={summary.metrics.ctr}
            icon={MousePointerClick}
            percent
          />
          <PublicMetric
            label="Posición"
            value={summary.metrics.averagePosition}
            icon={Search}
            decimal
          />
          <PublicMetric
            label="Eventos clave"
            value={summary.metrics.keyEvents}
            icon={Sparkles}
            decimal
          />
          <PublicMetric
            label="Tiempo medio"
            value={summary.metrics.averageEngagementTime}
            icon={Clock3}
            duration
          />
        </section>

        <ArticlePerformanceReport items={summary.pagePerformance} />

        <MonthlyPerformanceTable summary={summary} />

        <section className="grid gap-4 xl:grid-cols-[1.45fr_.8fr]">
          <Card className="rounded-2xl shadow-card">
            <CardHeader>
              <CardTitle>Tendencia diaria</CardTitle>
              <p className="text-xs text-muted-foreground">
                Sesiones y clics; cada serie utiliza su propia escala.
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
                      {formatNumber(item.clicks)} clics
                    </span>
                  </div>
                ))
              ) : (
                <EmptyData />
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle>Páginas con mayor actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-semibold">Página</th>
                    <th className="pb-2 text-right font-semibold">Sesiones</th>
                    <th className="pb-2 text-right font-semibold">Vistas</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.topPages.map((item) => (
                    <tr key={item.pagePath}>
                      <td
                        className="max-w-[720px] truncate py-3 pr-5 font-medium"
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
              {!summary.topPages.length ? <EmptyData /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              Desempeño por nota publicada
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cortes acumulados desde la fecha real de publicación.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.publicationPerformance.map((publication) => (
              <article key={publication.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <FileCheck2 className="size-4 shrink-0 text-emerald-600" />
                      <span className="line-clamp-2">
                        {publication.note.versions[0]?.title ??
                          "Nota publicada"}
                      </span>
                    </p>
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
                    {formatDate(publication.publishedAt)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {publication.milestones.map((milestone) => (
                    <div
                      key={milestone.days}
                      className="rounded-xl bg-muted/45 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">
                          {milestone.days} días
                        </span>
                        <Badge variant="outline">
                          {milestone.status === "COMPLETE"
                            ? "Completo"
                            : "En curso"}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                        <PublicationValue
                          label="Sesiones"
                          value={milestone.ga4.sessions}
                        />
                        <PublicationValue
                          label="Clics"
                          value={milestone.gsc.clicks}
                        />
                        <PublicationValue
                          label="Impres."
                          value={milestone.gsc.impressions}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {!summary.publicationPerformance.length ? <EmptyData /> : null}
          </CardContent>
        </Card>

        <footer className="rounded-2xl border bg-white/75 p-4 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-foreground">
            Cómo leer este informe
          </p>
          <p className="mt-1">{summary.methodology.note}</p>
          <p className="mt-1">
            Última sincronización:{" "}
            {summary.lastSyncCompletedAt
              ? formatDateTime(summary.lastSyncCompletedAt)
              : "pendiente"}
            .
          </p>
        </footer>
      </div>
    </main>
  );
}

function PublicationValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-semibold tabular-nums">{formatNumber(value)}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function PublicMetric({
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
  const change = value.changePercent;
  const display = duration
    ? formatDuration(value.current)
    : percent
    ? `${(value.current * 100).toFixed(1)}%`
    : decimal
      ? value.current.toLocaleString("es-PE", { maximumFractionDigits: 1 })
      : formatNumber(value.current);
  return (
    <div className="min-w-0 rounded-2xl border bg-white p-3 shadow-card sm:p-4">
      <span className="grid size-8 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 truncate text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums sm:text-2xl">
        {display}
      </p>
      <p
        className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${change === null || change === 0 ? "text-muted-foreground" : value.favorable ? "text-emerald-600" : "text-rose-600"}`}
      >
        {change === null ? (
          "Sin base anterior"
        ) : change === 0 ? (
          "Sin variación"
        ) : (
          <>
            {change > 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {Math.abs(change).toFixed(1)}%
          </>
        )}
      </p>
    </div>
  );
}

function formatDuration(value: number) {
  if (!value) return "—";
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function TrendChart({ summary }: { summary: AnalyticsSummary }) {
  const width = 760;
  const height = 220;
  const padding = 18;
  const points = summary.daily;
  const maxSessions = Math.max(1, ...points.map((item) => item.sessions));
  const maxClicks = Math.max(1, ...points.map((item) => item.clicks));
  const x = (index: number) =>
    padding + (index * (width - padding * 2)) / Math.max(1, points.length - 1);
  const y = (value: number, max: number) =>
    height - padding - (value / max) * (height - padding * 2);
  const sessions = points
    .map((item, index) => `${x(index)},${y(item.sessions, maxSessions)}`)
    .join(" ");
  const clicks = points
    .map((item, index) => `${x(index)},${y(item.clicks, maxClicks)}`)
    .join(" ");
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-primary" />
          Sesiones
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-emerald-500" />
          Clics
        </span>
      </div>
      <svg
        className="h-[190px] w-full overflow-visible sm:h-[230px]"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Tendencia de sesiones y clics por día"
      >
        {[0, 1, 2, 3, 4].map((item) => (
          <line
            key={item}
            x1={padding}
            x2={width - padding}
            y1={padding + item * ((height - padding * 2) / 4)}
            y2={padding + item * ((height - padding * 2) / 4)}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="4 7"
          />
        ))}
        {points.length > 1 ? (
          <>
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sessions}
            />
            <polyline
              fill="none"
              stroke="#23aa91"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={clicks}
            />
          </>
        ) : null}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(summary.period.startDate)}</span>
        <span>{formatDate(summary.period.endDate)}</span>
      </div>
    </div>
  );
}

export function MonthlyPerformanceTable({
  summary,
}: {
  summary: AnalyticsSummary;
}) {
  if (!summary.monthly.length) return null;
  return (
    <Card className="overflow-hidden rounded-2xl shadow-card">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          Evolución mensual del blog
        </CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">
          Comparativo de visibilidad orgánica y consumo de contenidos para las URLs del blog incluidas en el periodo.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b bg-muted/35 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Mes</th>
                <th className="px-3 py-3 text-right font-semibold">Sesiones</th>
                <th className="px-3 py-3 text-right font-semibold">Vistas</th>
                <th className="px-3 py-3 text-right font-semibold">Clics</th>
                <th className="px-3 py-3 text-right font-semibold">Impresiones</th>
                <th className="px-3 py-3 text-right font-semibold">CTR</th>
                <th className="px-4 py-3 text-right font-semibold">Posición</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.monthly.map((item) => (
                <tr key={item.month} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-semibold capitalize">
                    {new Date(`${item.month}-01T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(item.sessions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(item.views)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-primary">{formatNumber(item.clicks)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(item.impressions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{(item.ctr * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.position ? item.position.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyData() {
  return (
    <p className="py-5 text-center text-sm text-muted-foreground">
      Aún no hay datos disponibles para este periodo.
    </p>
  );
}

function Unavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8fb] p-5">
      <div className="max-w-md rounded-2xl border bg-white p-7 text-center shadow-card">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <BarChart3 />
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold">
          Enlace no disponible
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          El enlace venció, fue revocado o no es válido. Solicita uno nuevo al
          equipo responsable.
        </p>
      </div>
    </main>
  );
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("es-PE");
}
function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "es-PE",
    { day: "2-digit", month: "short", year: "numeric" },
  );
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
