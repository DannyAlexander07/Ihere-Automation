"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  MousePointerClick,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PagePerformance } from "./types";

const PAGE_SIZE = 8;

export function ArticlePerformanceReport({
  items,
}: {
  items: PagePerformance[];
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"ALL" | PagePerformance["source"]>("ALL");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-PE");
    return items.filter(
      (item) =>
        (scope === "ALL" || item.source === scope) &&
        (!term ||
          item.title.toLocaleLowerCase("es-PE").includes(term) ||
          item.pagePath.toLocaleLowerCase("es-PE").includes(term) ||
          item.topQueries.some((entry) =>
            entry.query.toLocaleLowerCase("es-PE").includes(term),
          )),
    );
  }, [items, query, scope]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <Card className="overflow-hidden rounded-2xl border-primary/15 shadow-card">
      <CardHeader className="gap-4 border-b bg-[radial-gradient(circle_at_95%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_38%)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Rendimiento por artículo
            </CardTitle>
            <Badge variant="secondary">{filtered.length} artículos</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Combina vistas y comportamiento de GA4 con clics, impresiones, CTR y posición de Search Console para cada URL del blog.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(220px,1fr)_180px] lg:w-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="pl-9 lg:w-72"
              placeholder="Buscar artículo o consulta…"
              aria-label="Buscar rendimiento por artículo"
              autoComplete="off"
            />
          </div>
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as typeof scope);
              setPage(1);
            }}
            className="h-9 rounded-lg border bg-white px-3 text-sm"
            aria-label="Filtrar origen del artículo"
          >
            <option value="ALL">Todos los artículos</option>
            <option value="I_HERE">Creados en I HERE</option>
            <option value="BLOG_HISTORY">Histórico del blog</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length ? (
          <>
            <div className="hidden overflow-x-auto 2xl:block">
              <table className="w-full min-w-[1280px] text-left text-xs">
                <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Artículo</th>
                    <th className="px-3 py-3 text-right font-semibold">Vistas</th>
                    <th className="px-3 py-3 text-right font-semibold">Sesiones</th>
                    <th className="px-3 py-3 text-right font-semibold">Usuarios</th>
                    <th className="px-3 py-3 text-right font-semibold">Clics</th>
                    <th className="px-3 py-3 text-right font-semibold">Impresiones</th>
                    <th className="px-3 py-3 text-right font-semibold">CTR</th>
                    <th className="px-3 py-3 text-right font-semibold">Posición</th>
                    <th className="px-3 py-3 text-right font-semibold">Interacción</th>
                    <th className="px-3 py-3 text-right font-semibold">Tiempo medio</th>
                    <th className="px-3 py-3 text-right font-semibold">Eventos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((item) => (
                    <tr key={item.pagePath} className="hover:bg-muted/20">
                      <td className="max-w-[420px] px-4 py-3">
                        <div className="flex items-start gap-2">
                          <SourceBadge source={item.source} />
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-semibold leading-5">{item.title}</p>
                            <ArticleLink item={item} />
                            <QueryList item={item} />
                          </div>
                        </div>
                      </td>
                      <NumberCell value={item.views} />
                      <NumberCell value={item.sessions} />
                      <NumberCell value={item.activeUsers} />
                      <NumberCell value={item.clicks} />
                      <NumberCell value={item.impressions} />
                      <TextCell value={formatPercent(item.ctr)} />
                      <TextCell value={item.position ? item.position.toFixed(1) : "—"} />
                      <TextCell value={formatPercent(item.engagementRate)} />
                      <TextCell value={formatDuration(item.averageEngagementTimeSeconds)} />
                      <NumberCell value={item.keyEvents} decimal />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid min-w-0 gap-3 p-3 sm:p-4 2xl:hidden">
              {visible.map((item) => (
                <article key={item.pagePath} className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-background p-3 sm:p-4">
                  <div className="flex items-start gap-2">
                    <SourceBadge source={item.source} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-5">{item.title}</p>
                      <ArticleLink item={item} />
                    </div>
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                    <MobileMetric icon={BarChart3} label="Vistas" value={formatNumber(item.views)} />
                    <MobileMetric label="Usuarios" value={formatNumber(item.activeUsers)} />
                    <MobileMetric icon={MousePointerClick} label="Clics" value={formatNumber(item.clicks)} />
                    <MobileMetric icon={Search} label="Impresiones" value={formatNumber(item.impressions)} />
                    <MobileMetric icon={Clock3} label="Tiempo medio" value={formatDuration(item.averageEngagementTimeSeconds)} />
                    <MobileMetric label="Sesiones" value={formatNumber(item.sessions)} />
                    <MobileMetric label="CTR" value={formatPercent(item.ctr)} />
                    <MobileMetric label="Posición" value={item.position ? item.position.toFixed(1) : "—"} />
                    <MobileMetric label="Interacción" value={formatPercent(item.engagementRate)} />
                    <MobileMetric label="Eventos" value={formatDecimal(item.keyEvents)} />
                  </div>
                  <QueryList item={item} />
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((value) => value - 1)} disabled={currentPage === 1} aria-label="Página anterior">
                  <ChevronLeft />
                </Button>
                <span className="min-w-20 text-center font-semibold text-foreground">Página {currentPage} de {totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => setPage((value) => value + 1)} disabled={currentPage === totalPages} aria-label="Página siguiente">
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <FileText className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No hay artículos para este filtro</p>
              <p className="mt-1 text-xs text-muted-foreground">Sincroniza GA4 y Search Console o amplía el periodo.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceBadge({ source }: { source: PagePerformance["source"] }) {
  return (
    <Badge variant={source === "I_HERE" ? "secondary" : "outline"} className="shrink-0">
      {source === "I_HERE" ? "I HERE" : "Histórico"}
    </Badge>
  );
}

function ArticleLink({ item }: { item: PagePerformance }) {
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-primary hover:underline">
      <span className="truncate">{item.pagePath}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  ) : (
    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.pagePath}</p>
  );
}

function QueryList({ item }: { item: PagePerformance }) {
  return item.topQueries.length ? (
    <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-1 overflow-hidden">
      {item.topQueries.map((query) => (
        <span key={query.query} className="min-w-0 max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground sm:max-w-52" title={query.query}>
          {query.query}
        </span>
      ))}
    </div>
  ) : null;
}

function NumberCell({ value, decimal = false }: { value: number; decimal?: boolean }) {
  return <td className="px-3 py-3 text-right font-semibold tabular-nums">{decimal ? formatDecimal(value) : formatNumber(value)}</td>;
}

function TextCell({ value }: { value: string }) {
  return <td className="px-3 py-3 text-right font-semibold tabular-nums">{value}</td>;
}

function MobileMetric({ icon: Icon, label, value }: { icon?: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-muted/45 p-2.5">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">{Icon ? <Icon className="size-3" /> : null}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(value: number) {
  if (!value) return "—";
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
