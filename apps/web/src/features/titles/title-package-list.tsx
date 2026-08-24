"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Grid2X2,
  Eye,
  List,
  MessageSquareWarning,
  PackageCheck,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCampaignMonth } from "@/lib/date/campaign-month";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TitleList } from "./title-list";
import {
  groupTitleFolders,
  type EditorialFolderGroup,
  type TitlePackageGroup,
} from "./title-packages";
import type { TitleCandidate } from "./types";
import { TitlePackagePreviewDialog } from "./title-package-preview-dialog";

type Props = {
  candidates: TitleCandidate[];
  canShare: boolean;
  canRevise: boolean;
  revisingPackageId: string | null;
  onSelect: (candidate: TitleCandidate) => void;
  onSharePackage: (group: TitlePackageGroup) => void;
  onRevisePackage: (group: TitlePackageGroup) => void;
};

const dateTime = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function TitlePackageList({
  candidates,
  canShare,
  canRevise,
  revisingPackageId,
  onSelect,
  onSharePackage,
  onRevisePackage,
}: Props) {
  const folders = useMemo(() => groupTitleFolders(candidates), [candidates]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [previewPackage, setPreviewPackage] = useState<TitlePackageGroup | null>(null);
  const selected = folders.find((folder) => folder.key === selectedKey) ?? null;

  if (!folders.length) return <TitleList candidates={[]} onSelect={onSelect} />;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/25 px-4 py-3">
        <nav
          className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
          aria-label="Ruta editorial"
        >
          {selected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedKey(null)}
            >
              <ArrowLeft /> Carpetas
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 font-semibold">
              <FolderOpen className="size-4 text-sky-600" /> Expedientes
              editoriales
            </span>
          )}
          {selected ? <FolderBreadcrumb folder={selected} /> : null}
        </nav>
        <div
          className="flex rounded-lg border bg-background p-1"
          aria-label="Tipo de vista"
        >
          <Button
            size="icon"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
            aria-label="Vista de cuadrícula"
          >
            <Grid2X2 />
          </Button>
          <Button
            size="icon"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
            aria-label="Vista de lista"
          >
            <List />
          </Button>
        </div>
      </div>

      {!selected ? (
        <FolderDirectory
          folders={folders}
          view={view}
          onOpen={setSelectedKey}
        />
      ) : (
        <div className="space-y-4 p-4">
          {selected.packages.map((group) => (
            <PackageCard
              key={group.id}
              group={group}
              canShare={canShare}
              canRevise={canRevise}
              revising={revisingPackageId === group.id}
              onSelect={onSelect}
              onSharePackage={onSharePackage}
              onRevisePackage={onRevisePackage}
              onPreview={setPreviewPackage}
            />
          ))}
        </div>
      )}
      <TitlePackagePreviewDialog
        key={previewPackage?.id ?? "closed"}
        group={previewPackage}
        onClose={() => setPreviewPackage(null)}
        onEdit={(candidate) => {
          setPreviewPackage(null);
          onSelect(candidate);
        }}
      />
    </section>
  );
}

function FolderBreadcrumb({ folder }: { folder: EditorialFolderGroup }) {
  return (
    <>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{folder.client}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{folder.year}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="capitalize text-muted-foreground">
        {formatCampaignMonth(folder.year, folder.month, false)}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
      <strong className="max-w-72 truncate">{folder.topic}</strong>
    </>
  );
}

function FolderDirectory({
  folders,
  view,
  onOpen,
}: {
  folders: EditorialFolderGroup[];
  view: "grid" | "list";
  onOpen: (key: string) => void;
}) {
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(folders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleFolders = folders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div>
      <div
        className={
          view === "grid"
            ? "grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3"
            : "divide-y"
        }
      >
        {visibleFolders.map((folder) => {
          const approved = folder.candidates.filter(
            (item) => item.status === "approved",
          ).length;
          const attention = folder.candidates.filter((item) =>
            ["changes_requested", "rejected"].includes(item.status),
          ).length;
          const approvalTarget = Math.min(4, folder.candidates.length);
          const progress = Math.min(
            100,
            Math.round((approved / Math.max(approvalTarget, 1)) * 100),
          );
          return (
            <button
              key={folder.key}
              type="button"
              onClick={() => onOpen(folder.key)}
              className={`group text-left transition hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                view === "grid"
                  ? "rounded-2xl border bg-background p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                  : "flex w-full items-center gap-4 px-4 py-3"
              }`}
            >
              <span className={view === "grid" ? "block" : "min-w-0 flex-1"}>
                <span className="flex min-w-0 items-start gap-3">
                  <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-secondary to-accent/70 text-primary ring-1 ring-border">
                    <Folder className="size-8 fill-primary/15" />
                    {attention ? (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                        {attention}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="line-clamp-2 text-[15px] font-bold leading-5 group-hover:text-primary sm:text-base">
                      {folder.topic}
                    </span>
                    <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                      {folder.client} ·{" "}
                      {formatCampaignMonth(folder.year, folder.month)}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {folder.candidates.length} títulos ·{" "}
                        {folder.packages.length} paquete
                        {folder.packages.length === 1 ? "" : "s"}
                      </span>
                      <strong className="text-foreground">{progress}%</strong>
                    </span>
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              </span>
              {view === "list" ? (
                <ChevronRight className="size-4 text-muted-foreground" />
              ) : null}
            </button>
          );
        })}
      </div>
      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 border-t bg-secondary/15 px-4 py-3"
          aria-label="Paginación de expedientes"
        >
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages} · {folders.length} expedientes
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft /> Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={currentPage === totalPages}
            >
              Siguiente <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PackageCard({
  group,
  canShare,
  canRevise,
  revising,
  onSelect,
  onSharePackage,
  onRevisePackage,
  onPreview,
}: {
  group: TitlePackageGroup;
  canShare: boolean;
  canRevise: boolean;
  revising: boolean;
  onSelect: (candidate: TitleCandidate) => void;
  onSharePackage: (group: TitlePackageGroup) => void;
  onRevisePackage: (group: TitlePackageGroup) => void;
  onPreview: (group: TitlePackageGroup) => void;
}) {
  const approved = group.candidates.filter(
    (candidate) => candidate.status === "approved",
  );
  const observed = group.candidates.filter((candidate) =>
    ["changes_requested", "rejected"].includes(candidate.status),
  );
  const readyToSend = group.candidates.filter((candidate) =>
    ["proposed", "evaluating"].includes(candidate.status),
  );
  const approvalTarget = Math.min(4, group.candidates.length);
  const packageComplete = approved.length >= approvalTarget;
  const isCorrection = approved.length > 0 && readyToSend.length > 0;
  const shareGroup = isCorrection
    ? { ...group, candidates: readyToSend }
    : group;

  return (
    <Card className="overflow-hidden border-border/80 bg-card shadow-none">
      <CardHeader className="gap-3 border-b bg-background p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">
              <PackageCheck className="size-3" /> Paquete
            </Badge>
            <span className="text-xs text-muted-foreground">
              {group.candidates.length} títulos
            </span>
            {packageComplete ? (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <CheckCircle2 /> Completo
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-2 text-base font-semibold sm:text-lg">
            {group.topic}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {packageDate(group)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5" /> {group.requestedBy}
            </span>
            <span>
              {approved.length} de {approvalTarget} aprobados
            </span>
            {observed.length && !packageComplete ? (
              <span className="text-amber-700">
                {observed.length} por corregir
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onPreview(group)}>
            <Eye />Vista previa interna
          </Button>
          {observed.length && !packageComplete ? (
            <Button
              variant="outline"
              onClick={() => onRevisePackage(group)}
              disabled={!canRevise || revising}
            >
              <RefreshCw className={revising ? "animate-spin" : ""} />
              {revising
                ? "Corrigiendo…"
                : `Corregir ${observed.length} pendiente${observed.length === 1 ? "" : "s"}`}
            </Button>
          ) : readyToSend.length && !packageComplete ? (
            <Button
              variant="outline"
              onClick={() => onSharePackage(shareGroup)}
              disabled={
                !canShare ||
                readyToSend.some((item) => item.status === "evaluating")
              }
            >
              <Send />
              {isCorrection
                ? `Enviar ${readyToSend.length} corrección${readyToSend.length === 1 ? "" : "es"}`
                : "Enviar paquete al cliente"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      {observed.length ? (
        <div className="grid gap-2 border-b bg-amber-50/70 p-4 md:grid-cols-2">
          {observed.map((candidate) => (
            <button
              type="button"
              key={candidate.id}
              onClick={() => onSelect(candidate)}
              className="rounded-xl border border-amber-200 bg-white p-3 text-left hover:border-amber-400"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <MessageSquareWarning className="size-4" />
                {candidate.status === "rejected" ? "Rechazado" : "Observado"} ·
                versión{` `}
                {candidate.clientFeedback?.version ?? candidate.currentVersion}
              </span>
              <span className="mt-1 block line-clamp-1 text-sm font-medium">
                {candidate.title}
              </span>
              <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                {candidate.clientFeedback?.reason ??
                  "Abre el título para revisar el motivo registrado."}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <CardContent className="p-0">
        <TitleList candidates={group.candidates} onSelect={onSelect} />
      </CardContent>
    </Card>
  );
}

function packageDate(group: TitlePackageGroup) {
  if (group.createdAt) {
    const parsed = new Date(group.createdAt);
    if (Number.isFinite(parsed.getTime())) return dateTime.format(parsed);
  }
  return group.candidates[0]?.updatedAt ?? "Fecha no disponible";
}
