"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Grid2X2,
  List,
  Send,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-provider";
import { formatCampaignMonth } from "@/lib/date/campaign-month";
import type { ApiClientSummary, ApiTitle } from "@/features/titles/title-api";
import { ApiError } from "@/lib/api/api-client";
import { ReviewLinkDialog } from "@/features/client-review/review-link-dialog";
import { NoteStatusBadge } from "./note-status-badge";
import { noteStatusLabels, type ApiNoteSummary, type NoteStatus } from "./types";

const selectClass = "h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NotesWorkspace() {
  const router = useRouter();
  const { apiFetch, user } = useAuth();
  const [clients, setClients] = useState<ApiClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState<ApiNoteSummary[]>([]);
  const [approvedTitles, setApprovedTitles] = useState<ApiTitle[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | NoteStatus>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderKey, setSelectedFolderKey] = useState<string | null>(null);
  const [folderView, setFolderView] = useState<"grid" | "list">("grid");
  const [folderPage, setFolderPage] = useState(1);
  const [reviewFolder, setReviewFolder] = useState<NoteFolder | null>(null);

  const loadNotes = useCallback(async (nextClientId: string) => {
    if (!nextClientId) {
      setNotes([]);
      setApprovedTitles([]);
      return;
    }
    const [nextNotes, titles] = await Promise.all([
      apiFetch<ApiNoteSummary[]>(`notes?clientId=${encodeURIComponent(nextClientId)}`),
      apiFetch<ApiTitle[]>(`titles?clientId=${encodeURIComponent(nextClientId)}&status=APPROVED`),
    ]);
    setNotes(nextNotes);
    setApprovedTitles(titles);
  }, [apiFetch]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextClients = await apiFetch<ApiClientSummary[]>("clients");
      const nextClientId = clientId || nextClients[0]?.id || "";
      setClients(nextClients);
      setClientId(nextClientId);
      await loadNotes(nextClientId);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, clientId, loadNotes]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const nextClients = await apiFetch<ApiClientSummary[]>("clients");
        const nextClientId = nextClients[0]?.id ?? "";
        const [nextNotes, titles] = nextClientId
          ? await Promise.all([
              apiFetch<ApiNoteSummary[]>(`notes?clientId=${encodeURIComponent(nextClientId)}`),
              apiFetch<ApiTitle[]>(`titles?clientId=${encodeURIComponent(nextClientId)}&status=APPROVED`),
            ])
          : [[], []];
        if (cancelled) return;
        setClients(nextClients);
        setClientId(nextClientId);
        setNotes(nextNotes);
        setApprovedTitles(titles);
      } catch (reason) {
        if (!cancelled) setError(messageFrom(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [apiFetch]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es");
    return notes.filter((note) => {
      const version = note.versions[0];
      return (statusFilter === "ALL" || note.status === statusFilter) &&
        (!normalized || [version?.title ?? "", note.client.name].some((value) => value.toLocaleLowerCase("es").includes(normalized)));
    });
  }, [notes, search, statusFilter]);

  const stats = useMemo(() => ({
    active: notes.filter((note) => !["APPROVED", "REJECTED", "EXPORTED", "ARCHIVED"].includes(note.status)).length,
    qa: notes.filter((note) => ["QA_QUEUED", "QA_RUNNING", "CHANGES_REQUESTED"].includes(note.status)).length,
    review: notes.filter((note) => note.status === "READY_FOR_REVIEW").length,
    approved: notes.filter((note) => ["APPROVED", "EXPORTED"].includes(note.status)).length,
  }), [notes]);

  const folders = useMemo(() => groupNoteFolders(filtered), [filtered]);
  const folderPageSize = 6;
  const folderPageCount = Math.max(1, Math.ceil(folders.length / folderPageSize));
  const currentFolderPage = Math.min(folderPage, folderPageCount);
  const visibleFolders = folders.slice((currentFolderPage - 1) * folderPageSize, currentFolderPage * folderPageSize);
  const selectedFolder =
    folders.find((folder) => folder.key === selectedFolderKey) ?? null;
  const reviewableNotes = (folder: NoteFolder) =>
    folder.notes.filter(
      (note) =>
        note.status === "READY_FOR_REVIEW" &&
        !note.clientApprovedCurrentVersion,
    );

  const createNote = async (titleId: string) => {
    setBusyId(titleId);
    try {
      const created = await apiFetch<{ id: string }>("notes", {
        method: "POST",
        body: JSON.stringify({ titleProposalId: titleId }),
      });
      setCreateOpen(false);
      router.push(`/automatizacion/notas/${created.id}`);
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusyId(null);
    }
  };

  const changeClient = async (nextClientId: string) => {
    setClientId(nextClientId);
    setSelectedFolderKey(null);
    setFolderPage(1);
    setLoading(true);
    setError(null);
    try { await loadNotes(nextClientId); } catch (reason) { setError(messageFrom(reason)); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 min-[1920px]:space-y-5">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card lg:flex-row lg:items-center">
        <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary"><FileText className="size-3.5" />Automatización de notas</div><h1 className="text-xl font-semibold sm:text-2xl">Bandeja editorial</h1><p className="mt-1 text-sm text-muted-foreground">Versiones, QA, decisiones y entregas desde un expediente trazable.</p></div>
        <Button onClick={() => setCreateOpen(true)} disabled={!approvedTitles.length || !user?.permissions.includes("notes.create")}><FilePlus2 />Crear desde título aprobado</Button>
      </section>

      {error ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>No pudimos completar la operación</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void initialize()}><RefreshCw />Reintentar</Button></AlertDescription></Alert> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumen de notas">
        {[["En proceso", stats.active], ["En QA o cambios", stats.qa], ["Para aprobación", stats.review], ["Aprobadas", stats.approved]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </section>

      <section className="rounded-xl border bg-card p-3 shadow-card sm:p-4">
        <div className="grid gap-2 md:grid-cols-[220px_1fr_220px]">
          <select value={clientId} onChange={(event) => void changeClient(event.target.value)} className={selectClass} aria-label="Seleccionar cliente">{clients.length ? null : <option value="">Sin clientes</option>}{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar por nota o cliente…" aria-label="Buscar notas" /></div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | NoteStatus)} className={selectClass} aria-label="Filtrar por estado"><option value="ALL">Todos los estados</option>{Object.entries(noteStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </section>

      {loading ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : filtered.length ? (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/25 px-4 py-3 text-sm">
            {selectedFolder ? (
              <Button variant="ghost" size="sm" onClick={() => setSelectedFolderKey(null)}>
                <ArrowLeft /> Carpetas
              </Button>
            ) : (
              <span className="inline-flex items-center gap-2 font-semibold">
                <FolderOpen className="size-4 text-sky-600" /> Expedientes de notas
              </span>
            )}
            {selectedFolder ? (
              <>
                <ChevronRight className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">{selectedFolder.client}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
                <span>{selectedFolder.year}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
                <span className="capitalize text-muted-foreground">{monthLabel(selectedFolder.year, selectedFolder.month)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
                <strong className="truncate">{selectedFolder.topic}</strong>
                {selectedFolder.generationRunId &&
                reviewableNotes(selectedFolder).length > 0 &&
                user?.permissions.includes("review_links.manage") ? (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => setReviewFolder(selectedFolder)}
                  >
                    <Send /> Enviar paquete al cliente
                  </Button>
                ) : null}
              </>
            ) : null}
            {!selectedFolder ? (
              <div className="ml-auto flex rounded-lg border bg-background p-1" aria-label="Tipo de vista">
                <Button size="icon" variant={folderView === "grid" ? "secondary" : "ghost"} onClick={() => setFolderView("grid")} aria-label="Vista de cuadrícula"><Grid2X2 /></Button>
                <Button size="icon" variant={folderView === "list" ? "secondary" : "ghost"} onClick={() => setFolderView("list")} aria-label="Vista de lista"><List /></Button>
              </div>
            ) : null}
          </div>
          {selectedFolder ? (
            <NoteCards notes={selectedFolder.notes} />
          ) : (
            <div>
            <div className={folderView === "grid" ? "grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3" : "divide-y"}>
              {visibleFolders.map((folder) => {
                const approved = folder.notes.filter((note) => ["APPROVED", "EXPORTED"].includes(note.status)).length;
                const attention = folder.notes.filter((note) => ["CHANGES_REQUESTED", "REJECTED"].includes(note.status)).length;
                const progress = Math.round((approved / Math.max(folder.notes.length, 1)) * 100);
                return (
                <button
                  key={folder.key}
                  type="button"
                  onClick={() => setSelectedFolderKey(folder.key)}
                  className={`group text-left transition hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${folderView === "grid" ? "rounded-2xl border bg-background p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md" : "flex w-full items-center gap-4 px-4 py-3"}`}
                >
                  <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-secondary to-accent/70 text-primary ring-1 ring-border">
                    <Folder className="size-8 fill-sky-200/70" />
                    {attention ? <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">{attention}</span> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block line-clamp-2 text-[15px] font-bold leading-5 group-hover:text-primary">{folder.topic}</strong>
                    <span className="mt-1 block text-xs capitalize text-muted-foreground">{folder.client} · {monthLabel(folder.year, folder.month)}</span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{approved} de {folder.notes.length} aprobadas</span><strong className="text-foreground">{progress}%</strong></span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></span>
                  </span>
                  {folderView === "list" ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
                </button>
              );})}
            </div>
            {folderPageCount > 1 ? (
              <nav className="flex flex-wrap items-center justify-between gap-3 border-t bg-secondary/15 px-4 py-3" aria-label="Paginación de expedientes de notas">
                <p className="text-xs text-muted-foreground">Página {currentFolderPage} de {folderPageCount} · {folders.length} expedientes</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setFolderPage((page) => Math.max(1, page - 1))} disabled={currentFolderPage === 1}><ChevronLeft />Anterior</Button>
                  <Button size="sm" variant="outline" onClick={() => setFolderPage((page) => Math.min(folderPageCount, page + 1))} disabled={currentFolderPage === folderPageCount}>Siguiente<ChevronRight /></Button>
                </div>
              </nav>
            ) : null}
            </div>
          )}
        </section>
      ) : (
        <Card>
          <CardContent className="grid min-h-56 place-items-center p-6 text-center">
            <div>
              <ShieldCheck className="mx-auto size-7 text-primary" />
              <p className="mt-3 text-sm font-semibold">No hay notas con estos filtros</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crea un expediente desde un título aprobado o ajusta los filtros.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Crear expediente de nota</DialogTitle><DialogDescription>Solo aparecen títulos aprobados que todavía no se han utilizado.</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{approvedTitles.length ? approvedTitles.map((title) => <button key={title.id} type="button" onClick={() => void createNote(title.id)} disabled={Boolean(busyId)} className="w-full rounded-xl border p-3 text-left hover:border-primary/30 hover:bg-secondary/30 disabled:opacity-60"><p className="text-sm font-semibold">{title.title}</p><p className="mt-1 text-xs text-muted-foreground">{title.objective}</p>{busyId === title.id ? <LoaderCircle className="mt-2 size-4 animate-spin" /> : null}</button>) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay títulos aprobados disponibles.</p>}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button></DialogFooter></DialogContent></Dialog>
      {reviewFolder?.generationRunId ? (
        <ReviewLinkDialog
          kind="note-package"
          entityId={reviewFolder.generationRunId}
          entityTitle={reviewFolder.topic}
          entityCount={reviewableNotes(reviewFolder).length}
          noteIds={reviewableNotes(reviewFolder).map((note) => note.id)}
          onClose={() => setReviewFolder(null)}
        />
      ) : null}
    </div>
  );
}

type NoteFolder = {
  key: string;
  client: string;
  year: number;
  month: number;
  topic: string;
  generationRunId: string | null;
  notes: ApiNoteSummary[];
};

function groupNoteFolders(notes: ApiNoteSummary[]): NoteFolder[] {
  const folders = new Map<string, NoteFolder>();
  notes.forEach((note) => {
    const run = note.titleProposal.generationRun;
    const created = new Date(run?.createdAt ?? note.createdAt);
    const key = run?.editorialFolderKey ?? `manual:${note.client.slug}:${note.id}`;
    const current = folders.get(key);
    if (current) {
      current.notes.push(note);
      return;
    }
    folders.set(key, {
      key,
      client: note.client.name,
      year: run?.campaignYear ?? created.getUTCFullYear(),
      month: run?.campaignMonth ?? created.getUTCMonth() + 1,
      topic: run?.campaignTopic ?? note.versions[0]?.title ?? "Expediente editorial",
      generationRunId: run?.id ?? null,
      notes: [note],
    });
  });
  return [...folders.values()].toSorted(
    (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month),
  );
}

function NoteCards({ notes }: { notes: ApiNoteSummary[] }) {
  return (
    <div className="grid gap-3 p-4">
      {notes.map((note) => {
        const version = note.versions[0];
        const qa = note.qaEvaluations[0];
        const blockers = Array.isArray(qa?.criticalBlockers)
          ? qa.criticalBlockers.length
          : 0;
        return (
          <Link
            key={note.id}
            href={`/automatizacion/notas/${note.id}`}
            className="group rounded-xl border bg-card p-4 transition hover:border-primary/30 hover:shadow-soft"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <NoteStatusBadge status={note.status} />
                  <Badge variant="outline">v{note.currentVersion}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {note.client.name}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-sm font-semibold group-hover:text-primary">
                  {version?.title ?? "Nota sin título"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {version?.wordCount ?? 0} palabras · {version?._count.sources ?? 0}{" "}
                  fuentes · Actualizada {formatDate(note.updatedAt)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <span className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <strong>{qa?.overallScore ?? "—"}</strong>
                  <span className="ml-1 text-muted-foreground">QA</span>
                </span>
                <span className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <strong>{blockers}</strong>
                  <span className="ml-1 text-muted-foreground">bloqueos</span>
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function monthLabel(year: number, month: number) {
  return formatCampaignMonth(year, month);
}

function formatDate(value: string) { return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function messageFrom(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : "Ocurrió un error inesperado."; }
