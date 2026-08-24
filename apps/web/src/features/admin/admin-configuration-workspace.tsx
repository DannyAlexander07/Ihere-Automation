"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpenCheck, Building2, History, Search, Settings, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { AdminEmpty, AdminError, AdminLoading, ForbiddenAdminState, errorMessage } from "./admin-states";
import type { AdminClient, AdminRole, AuditEntry, Paginated } from "./admin-types";

type View = "catalogs" | "audit";

export function AdminConfigurationWorkspace() {
  const { apiFetch, user } = useAuth();
  const canReadAudit = user?.tenantPermissions.includes("audit.read") ?? false;
  const canReadCatalogs = (user?.tenantPermissions.includes("users.manage") ?? false) && (user?.tenantPermissions.includes("roles.manage") ?? false);
  const [view, setView] = useState<View>(canReadCatalogs ? "catalogs" : "audit");

  if (!canReadAudit && !canReadCatalogs) return <ForbiddenAdminState />;

  return (
    <div className="space-y-4 min-[1920px]:space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary"><Settings className="size-3.5" />Administración</div>
        <h1 className="text-xl font-semibold sm:text-2xl">Configuración y trazabilidad</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta los catálogos autorizados y la bitácora inmutable de acciones.</p>
      </section>

      <div className="flex w-full gap-1 rounded-xl border bg-card p-1 sm:w-fit" role="tablist" aria-label="Secciones de configuración">
        {canReadCatalogs ? <TabButton active={view === "catalogs"} onClick={() => setView("catalogs")}><BookOpenCheck />Catálogos</TabButton> : null}
        {canReadAudit ? <TabButton active={view === "audit"} onClick={() => setView("audit")}><History />Bitácora</TabButton> : null}
      </div>

      {view === "catalogs" && canReadCatalogs ? <CatalogsPanel apiFetch={apiFetch} /> : null}
      {view === "audit" && canReadAudit ? <AuditPanel apiFetch={apiFetch} /> : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button role="tab" aria-selected={active} variant={active ? "default" : "ghost"} size="sm" className="flex-1 sm:flex-none" onClick={onClick}>{children}</Button>;
}

function CatalogsPanel({ apiFetch }: { apiFetch: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [nextRoles, nextClients] = await Promise.all([apiFetch<AdminRole[]>("admin/roles"), apiFetch<AdminClient[]>("admin/clients")]); setRoles(nextRoles); setClients(nextClients); }
    catch (reason) { setError(errorMessage(reason)); } finally { setLoading(false); }
  }, [apiFetch]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiFetch<AdminRole[]>("admin/roles"), apiFetch<AdminClient[]>("admin/clients")])
      .then(([nextRoles, nextClients]) => { if (!cancelled) { setRoles(nextRoles); setClients(nextClients); } })
      .catch((reason: unknown) => { if (!cancelled) setError(errorMessage(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch]);
  if (error) return <AdminError message={error} onRetry={() => void load()} />;
  if (loading) return <AdminLoading label="Cargando catálogos administrativos" />;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr] min-[1920px]:gap-6">
      <section className="rounded-xl border bg-card p-4 shadow-card" aria-labelledby="role-catalog-title">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><div><h2 id="role-catalog-title" className="font-semibold">Roles y permisos</h2><p className="text-xs text-muted-foreground">Catálogo efectivo de la organización.</p></div></div>
        {roles.length ? <div className="grid gap-3 lg:grid-cols-2">{roles.map((role) => (
          <article key={role.id} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{role.name}</h3><p className="text-xs text-muted-foreground">{role.code}</p></div><Badge variant="outline">{role.assignmentCount} asignaciones</Badge></div>
            <p className="mt-2 text-sm text-muted-foreground">{role.description ?? "Sin descripción."}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <Badge key={permission.code} variant="secondary" title={permission.description ?? permission.code}>{permission.code}</Badge>)}</div>
            <p className="mt-3 text-xs text-muted-foreground">{role.clientAssignable ? "Puede limitarse a un cliente." : "Solo puede asignarse a toda la organización."}</p>
          </article>
        ))}</div> : <AdminEmpty title="No hay roles configurados" description="El catálogo de roles está vacío." />}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-card" aria-labelledby="client-catalog-title">
        <div className="mb-4 flex items-center gap-2"><Building2 className="size-4 text-primary" /><div><h2 id="client-catalog-title" className="font-semibold">Clientes</h2><p className="text-xs text-muted-foreground">Alcances disponibles para roles.</p></div></div>
        {clients.length ? <div className="space-y-2">{clients.map((client) => <div key={client.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-medium">{client.name}</p><p className="truncate text-xs text-muted-foreground">{client.slug}</p></div><Badge variant="outline" className={client.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>{client.active ? "Activo" : "Inactivo"}</Badge></div>)}</div> : <AdminEmpty title="No hay clientes" description="Aún no existen alcances de cliente configurados." />}
      </section>
    </div>
  );
}

function AuditPanel({ apiFetch }: { apiFetch: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [result, setResult] = useState<Paginated<AuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState("");
  const [entityDraft, setEntityDraft] = useState("");
  const [filters, setFilters] = useState({ action: "", entityType: "" });
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    try { setResult(await apiFetch<Paginated<AuditEntry>>(`admin/audit?${params}`)); }
    catch (reason) { setError(errorMessage(reason)); } finally { setLoading(false); }
  }, [apiFetch, filters, page]);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    void apiFetch<Paginated<AuditEntry>>(`admin/audit?${params}`)
      .then((nextResult) => { if (!cancelled) setResult(nextResult); })
      .catch((reason: unknown) => { if (!cancelled) setError(errorMessage(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch, filters, page]);
  function filter(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setFilters({ action: actionDraft.trim(), entityType: entityDraft.trim() }); }
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-3 shadow-card">
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto]" autoComplete="off" onSubmit={filter}>
          <div><Label className="sr-only" htmlFor="audit-action">Acción</Label><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="audit-action" value={actionDraft} onChange={(event) => setActionDraft(event.target.value)} placeholder="Buscar acción" className="pl-9" /></div></div>
          <div><Label className="sr-only" htmlFor="audit-entity">Entidad</Label><Input id="audit-entity" value={entityDraft} onChange={(event) => setEntityDraft(event.target.value)} placeholder="Entidad: User, UserRole…" /></div>
          <Button type="submit" variant="outline">Filtrar</Button>
        </form>
      </section>
      {error ? <AdminError message={error} onRetry={() => void load()} /> : null}
      {loading ? <AdminLoading label="Cargando bitácora" /> : result?.items.length ? (
        <section className="overflow-hidden rounded-xl border bg-card shadow-card" aria-labelledby="audit-title">
          <div className="border-b px-4 py-3"><h2 id="audit-title" className="font-semibold">Bitácora de acciones</h2><p className="text-xs text-muted-foreground">Registro de quién hizo qué y cuándo.</p></div>
          <div className="divide-y">{result.items.map((entry) => <AuditRow key={entry.id} entry={entry} />)}</div>
        </section>
      ) : <AdminEmpty title="Sin eventos para estos filtros" description="No se encontraron acciones en la bitácora." />}
      {result && result.totalPages > 1 ? <nav className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm" aria-label="Paginación de bitácora"><span className="text-muted-foreground">Página {result.page} de {result.totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= result.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></nav> : null}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const timestamp = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt));
  return (
    <article className="p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{entry.action}</Badge><span className="text-xs text-muted-foreground">{entry.entityType}</span></div><p className="mt-2 text-sm"><span className="font-medium">{entry.user?.displayName ?? entry.actorType}</span>{entry.client ? ` · ${entry.client.name}` : " · Organización"}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>{timestamp}</time></div>
      {(entry.before || entry.after) ? <details className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs"><summary className="cursor-pointer font-medium">Ver cambios registrados</summary><div className="mt-2 grid gap-2 lg:grid-cols-2">{entry.before ? <Snapshot label="Antes" value={entry.before} /> : null}{entry.after ? <Snapshot label="Después" value={entry.after} /> : null}</div></details> : null}
    </article>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) { return <div className="min-w-0"><p className="mb-1 font-medium">{label}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-2 text-[11px]">{JSON.stringify(value, null, 2)}</pre></div>; }
