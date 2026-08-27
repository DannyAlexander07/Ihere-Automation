"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Layers3,
  Lightbulb,
  ListPlus,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { hasClientPermission } from "@/features/auth/permissions";
import { ApiError } from "@/lib/api/api-client";
import { ReviewLinkDialog } from "@/features/client-review/review-link-dialog";
import {
  type ApiAiGenerationRun,
  generationFailureMessage,
  generationProgress,
  terminalGenerationStatuses,
  type TitleGenerationInput,
  type TitleBriefSuggestion,
  type TitleGenerationProgress,
  type TitleSearchIntent,
  type TitleGenerationSummary,
} from "./ai-generation-api";
import { GenerateTitlesDialog } from "./generate-titles-dialog";
import { getTitleBlockingReasons, titleStatusLabels } from "./rules";
import { type ApiClientSummary, type ApiTitle, mapApiTitle } from "./title-api";
import { TitleDetailSheet } from "./title-detail-sheet";
import { TitlePackageList } from "./title-package-list";
import type { EditorialFolderGroup, TitlePackageGroup } from "./title-packages";
import { TitleRulesDialog } from "./title-rules-dialog";
import type {
  DuplicateLevel,
  TitleCandidate,
  TitleCorrectionType,
  TitleEditorialDraft,
  TitleStatus,
} from "./types";

type Notice = {
  tone: "success" | "warning";
  title: string;
  description: string;
};
type StatusFilter = "all" | TitleStatus;
type DuplicateFilter = "all" | DuplicateLevel;
type DeleteTarget =
  | { kind: "title"; candidate: TitleCandidate }
  | { kind: "folder"; folder: EditorialFolderGroup };

const selectClass =
  "h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const correctionMap: Record<TitleCorrectionType, string> = {
  permanent_preference: "BRAND",
  factual_correction: "FACTUAL",
  tone_adjustment: "STYLE",
  intent_change: "INTENT",
  one_off: "OTHER",
};

const duplicateMap: Record<
  TitleCandidate["duplicate"]["recommendation"],
  string
> = {
  Crear: "CREATE_NEW",
  Complementar: "COMPLEMENT",
  Actualizar: "UPDATE_EXISTING",
  Fusionar: "MERGE",
  Descartar: "DISCARD",
};

export function TitleWorkspace() {
  const { apiFetch, user } = useAuth();
  const [clients, setClients] = useState<ApiClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [candidates, setCandidates] = useState<TitleCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reviewTitleId, setReviewTitleId] = useState<string | null>(null);
  const [reviewPackage, setReviewPackage] = useState<TitlePackageGroup | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [duplicateFilter, setDuplicateFilter] =
    useState<DuplicateFilter>("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revisingPackageId, setRevisingPackageId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const owner = user?.displayName ?? "Usuario autorizado";
  const selected =
    candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const selectedClient =
    clients.find((client) => client.id === clientId) ?? null;
  const selectedPermissionClientId = selected?.clientId ?? clientId;
  const selectedPermissions = {
    canCreate:
      hasClientPermission(user, "titles.create", clientId) &&
      hasClientPermission(user, "ai.generate", clientId),
    canEditAndEvaluate: selected
      ? hasClientPermission(user, "titles.edit", selectedPermissionClientId) &&
        hasClientPermission(user, "titles.evaluate", selectedPermissionClientId)
      : false,
    canReview: selected
      ? hasClientPermission(user, "titles.review", selectedPermissionClientId)
      : false,
    canShare: selected
      ? hasClientPermission(
          user,
          "review_links.manage",
          selectedPermissionClientId,
        )
      : false,
    canDelete: Boolean(user?.tenantPermissions.includes("titles.delete")),
  };
  const canSharePackages = hasClientPermission(
    user,
    "review_links.manage",
    clientId,
  );
  const canRevisePackages =
    hasClientPermission(user, "ai.generate", clientId) &&
    hasClientPermission(user, "titles.edit", clientId);
  const canDeleteTitles = Boolean(
    user?.tenantPermissions.includes("titles.delete"),
  );
  const hasActiveEvaluations = candidates.some((candidate) =>
    ["QUEUED", "RUNNING"].includes(candidate.evaluationStatus ?? ""),
  );

  const fetchTitles = useCallback(
    async (nextClientId: string) => {
      const titles = await apiFetch<ApiTitle[]>(
        `titles?clientId=${encodeURIComponent(nextClientId)}`,
      );
      setCandidates(titles.map((title) => mapApiTitle(title, owner)));
    },
    [apiFetch, owner],
  );

  const suggestTitleBrief = useCallback(
    async (
      campaignYear: number,
      campaignMonth: number,
      searchIntent: TitleSearchIntent,
    ) => {
      if (!clientId)
        throw new Error("Selecciona un cliente antes de preparar el encargo.");
      let current = await apiFetch<ApiAiGenerationRun>(
        "ai/generations/titles/brief",
        {
          method: "POST",
          body: JSON.stringify({
            clientId,
            campaignYear,
            campaignMonth,
            searchIntent,
          }),
        },
      );
      const deadline = Date.now() + 5 * 60_000;
      while (!terminalGenerationStatuses.has(current.status)) {
        if (Date.now() >= deadline) {
          throw new Error(
            "El encargo sigue preparándose. Cierra y vuelve a abrir esta ventana en unos minutos.",
          );
        }
        await wait(1_200);
        current = await apiFetch<ApiAiGenerationRun>(
          `ai/generations/${current.id}`,
        );
      }
      if (current.status !== "COMPLETED") {
        throw new Error(generationFailureMessage(current));
      }
      const suggestion = current.output?.suggestion;
      if (!suggestion) {
        throw new Error("El encargo no devolvió campos editables válidos.");
      }
      return suggestion as TitleBriefSuggestion;
    },
    [apiFetch, clientId],
  );

  const loadWorkspace = useCallback(async () => {
    try {
      const availableClients = await apiFetch<ApiClientSummary[]>("clients");
      setClients(availableClients);
      const nextClientId = clientId || availableClients[0]?.id || "";
      setClientId(nextClientId);
      if (nextClientId) await fetchTitles(nextClientId);
      else setCandidates([]);
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, clientId, fetchTitles]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const availableClients = await apiFetch<ApiClientSummary[]>("clients");
        const firstClientId = availableClients[0]?.id ?? "";
        const titles = firstClientId
          ? await apiFetch<ApiTitle[]>(
              `titles?clientId=${encodeURIComponent(firstClientId)}`,
            )
          : [];
        if (cancelled) return;
        setClients(availableClients);
        setClientId(firstClientId);
        setCandidates(titles.map((title) => mapApiTitle(title, owner)));
      } catch (error) {
        if (!cancelled) setLoadError(messageFrom(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, owner]);

  const filteredCandidates = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es");
    return candidates.filter((candidate) => {
      const matchesSearch =
        !normalized ||
        [
          candidate.title,
          candidate.campaign,
          candidate.owner,
          ...candidate.tags,
        ].some((value) => value.toLocaleLowerCase("es").includes(normalized));
      const matchesStatus =
        statusFilter === "all" || candidate.status === statusFilter;
      const matchesDuplicate =
        duplicateFilter === "all" ||
        candidate.duplicate.level === duplicateFilter;
      return matchesSearch && matchesStatus && matchesDuplicate;
    });
  }, [candidates, duplicateFilter, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: candidates.length,
      pending: candidates.filter((candidate) =>
        ["draft", "proposed", "evaluating", "changes_requested"].includes(
          candidate.status,
        ),
      ).length,
      approved: candidates.filter(
        (candidate) => candidate.status === "approved",
      ).length,
      blocked: candidates.filter(
        (candidate) => getTitleBlockingReasons(candidate).length > 0,
      ).length,
    }),
    [candidates],
  );

  const refreshTitle = useCallback(
    async (id: string) => {
      const title = await apiFetch<ApiTitle>(`titles/${id}`);
      const mapped = mapApiTitle(title, owner);
      setCandidates((current) =>
        current.map((candidate) => (candidate.id === id ? mapped : candidate)),
      );
      return mapped;
    },
    [apiFetch, owner],
  );

  useEffect(() => {
    if (!clientId || !hasActiveEvaluations) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchTitles(clientId).catch(() => undefined);
      }
    }, 2_500);

    return () => window.clearInterval(interval);
  }, [clientId, fetchTitles, hasActiveEvaluations]);

  const selectCandidate = async (candidate: TitleCandidate) => {
    setSelectedId(candidate.id);
    setDetailOpen(true);
    setBusyId(candidate.id);
    try {
      await refreshTitle(candidate.id);
    } catch (error) {
      showError("No pudimos cargar el detalle", error);
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (
    id: string,
    action: "approve" | "changes" | "reject",
    reason: string,
  ) => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    setBusyId(id);
    try {
      const type =
        action === "approve"
          ? "APPROVE"
          : action === "reject"
            ? "REJECT"
            : "REQUEST_CHANGES";
      await apiFetch(`titles/${id}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: candidate.currentVersion ?? 1,
          type,
          reason,
        }),
      });
      const actionLabel =
        action === "approve"
          ? "Título aprobado"
          : action === "reject"
            ? "Título rechazado"
            : "Cambios solicitados";
      await refreshTitle(id);
      setNotice({
        tone: action === "approve" ? "success" : "warning",
        title: actionLabel,
        description:
          "La decisión y su motivo quedaron registrados correctamente.",
      });
    } catch (error) {
      showError("No se pudo registrar la decisión", error);
    } finally {
      setBusyId(null);
    }
  };

  const editTitle = async (
    id: string,
    draft: TitleEditorialDraft,
    type: TitleCorrectionType,
    reason: string,
    confirmedPermanent: boolean,
  ) => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    setBusyId(id);
    try {
      const changeReason = confirmedPermanent
        ? `[Regla candidata pendiente de autorización] ${reason}`
        : reason;
      await apiFetch<ApiTitle>(`titles/${id}/revisions/evaluate`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: candidate.currentVersion ?? 1,
          ...draft,
          reason: changeReason,
          correctionType: correctionMap[type],
        }),
      });
      await refreshTitle(id);
      setNotice({
        tone: "success",
        title: "Corrección persistida",
        description: confirmedPermanent
          ? "La corrección quedó como señal candidata; todavía requiere autorización para convertirse en regla."
          : "La nueva versión y su motivo quedaron registrados y volvieron a evaluación.",
      });
    } catch (error) {
      showError("No se pudo guardar la corrección", error);
    } finally {
      setBusyId(null);
    }
  };

  const resolveDuplicate = async (
    id: string,
    recommendation: TitleCandidate["duplicate"]["recommendation"],
    reason: string,
  ) => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    setBusyId(id);
    try {
      await apiFetch(`titles/${id}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: candidate.currentVersion ?? 1,
          type: "RESOLVE_DUPLICATE",
          reason,
          duplicateResolution: duplicateMap[recommendation],
        }),
      });
      await refreshTitle(id);
      setNotice({
        tone: "success",
        title: "Duplicidad resuelta",
        description: `La decisión “${recommendation}” y su justificación quedaron auditadas.`,
      });
    } catch (error) {
      showError("No se pudo resolver la duplicidad", error);
    } finally {
      setBusyId(null);
    }
  };

  const generateTitles = async (
    input: TitleGenerationInput,
    onProgress: (progress: TitleGenerationProgress) => void,
  ): Promise<TitleGenerationSummary> => {
    if (!clientId)
      throw new Error("Selecciona un cliente antes de preparar propuestas.");
    const queued = await apiFetch<ApiAiGenerationRun>("ai/generations/titles", {
      method: "POST",
      body: JSON.stringify({ clientId, ...input }),
    });
    onProgress(generationProgress(queued));
    let current = queued;
    const deadline = Date.now() + 10 * 60_000;

    while (!terminalGenerationStatuses.has(current.status)) {
      if (Date.now() >= deadline) {
        throw new Error(
          "La generación sigue ejecutándose. Cierra esta ventana y actualiza las propuestas en unos minutos.",
        );
      }
      await wait(1_500);
      current = await apiFetch<ApiAiGenerationRun>(
        `ai/generations/${queued.id}`,
      );
      onProgress(generationProgress(current));
    }

    if (current.status !== "COMPLETED")
      throw new Error(generationFailureMessage(current));
    await fetchTitles(clientId);
    const proposalCount = current.titleProposals?.length ?? 0;
    setNotice({
      tone: "success",
      title: `${proposalCount} propuestas generadas y evaluadas`,
      description:
        "Quedaron pendientes de revisión y decisión humana. El historial y cada control están registrados.",
    });
    return {
      proposalCount,
      costMicros: current.costMicros,
    };
  };

  const revisePackage = async (group: TitlePackageGroup) => {
    setRevisingPackageId(group.id);
    setNotice(null);
    try {
      const queued = await apiFetch<ApiAiGenerationRun[]>(
        `ai/generations/title-packages/${group.id}/revise-pending`,
        { method: "POST" },
      );
      if (!queued.length) {
        throw new Error(
          "Las correcciones ya están en proceso. Espera unos segundos y actualiza la carpeta.",
        );
      }
      const deadline = deadlineAfter(10 * 60_000);
      await Promise.all(
        queued.map(async (initial) => {
          let current = initial;
          while (!terminalGenerationStatuses.has(current.status)) {
            if (Date.now() >= deadline) {
              throw new Error(
                "Las correcciones siguen ejecutándose. La carpeta se actualizará cuando terminen.",
              );
            }
            await wait(1_500);
            current = await apiFetch<ApiAiGenerationRun>(
              `ai/generations/${initial.id}`,
            );
          }
          if (current.status !== "COMPLETED") {
            throw new Error(generationFailureMessage(current));
          }
        }),
      );
      await fetchTitles(clientId);
      setNotice({
        tone: "success",
        title: "Correcciones preparadas",
        description:
          "Cada observación se aplicó sobre el mismo título. Las versiones anteriores quedaron en el historial y las nuevas pasarán su control antes del reenvío.",
      });
    } catch (error) {
      showError("No se pudieron completar las correcciones", error);
    } finally {
      setRevisingPackageId(null);
    }
  };

  const changeClient = async (nextClientId: string) => {
    setClientId(nextClientId);
    setLoading(true);
    setLoadError(null);
    try {
      await fetchTitles(nextClientId);
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setLoading(false);
    }
  };

  const showError = (title: string, error: unknown) => {
    setNotice({ tone: "warning", title, description: messageFrom(error) });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "title") {
        await apiFetch(`titles/${deleteTarget.candidate.id}`, {
          method: "DELETE",
        });
      } else {
        await apiFetch("titles/folders", {
          method: "DELETE",
          body: JSON.stringify({
            clientId: deleteTarget.folder.clientId,
            folderKey: deleteTarget.folder.key,
          }),
        });
      }
      setDetailOpen(false);
      setSelectedId(null);
      setDeleteTarget(null);
      await fetchTitles(clientId);
      setNotice({
        tone: "success",
        title:
          deleteTarget.kind === "title"
            ? "Título eliminado"
            : "Expediente eliminado",
        description:
          "La eliminación quedó registrada en la bitácora administrativa.",
      });
    } catch (error) {
      showError("No se pudo eliminar", error);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDuplicateFilter("all");
  };

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    void loadWorkspace();
  };

  return (
    <div className="space-y-4 min-[1920px]:space-y-5">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card xl:flex-row xl:items-center">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
            <Lightbulb className="size-3.5" />
            Automatización de notas
          </div>
          <h1 className="text-balance text-xl font-semibold sm:text-2xl">
            Propuestas de títulos
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
            Genera alternativas con contexto, conserva versiones y registra cada
            decisión humana en una fuente de verdad.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setRulesOpen(true)}>
            <ShieldCheck />
            Reglas de Adecco
          </Button>
          <Button
            onClick={() => setGeneratorOpen(true)}
            disabled={!clientId || !selectedPermissions.canCreate}
          >
            <ListPlus />
            Generar propuestas
          </Button>
        </div>
      </section>

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="Resumen de propuestas"
      >
        {[
          ["Total", stats.total, Layers3, "bg-secondary text-primary"],
          ["Por decidir", stats.pending, Filter, "bg-blue-50 text-blue-700"],
          [
            "Aprobados",
            stats.approved,
            CheckCircle2,
            "bg-emerald-50 text-emerald-700",
          ],
          [
            "Bloqueos",
            stats.blocked,
            AlertTriangle,
            "bg-amber-50 text-amber-800",
          ],
        ].map(([label, value, Icon, tone]) => {
          const MetricIcon = Icon as typeof Layers3;
          return (
            <Card
              key={label as string}
              className="border-border/80 bg-card/95 shadow-card"
            >
              <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {label as string}
                  </p>
                  <p className="mt-1 font-heading text-xl font-semibold">
                    {value as number}
                  </p>
                </div>
                <span
                  className={`grid size-8 place-items-center rounded-lg ${tone as string}`}
                >
                  <MetricIcon className="size-4" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {notice ? (
        <Alert
          className={
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }
        >
          {notice.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.description}</AlertDescription>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>No pudimos cargar las propuestas</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={retryLoad}>
              <RefreshCw />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-xl border bg-card p-3 shadow-card sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            value={clientId}
            onChange={(event) => void changeClient(event.target.value)}
            className={selectClass}
            aria-label="Seleccionar cliente"
          >
            {clients.length ? null : (
              <option value="">Sin clientes habilitados</option>
            )}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, campaña, responsable o tema…"
              className="bg-card pl-9"
              aria-label="Buscar propuestas"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className={selectClass}
              aria-label="Filtrar por estado"
            >
              <option value="all">Todos los estados</option>
              {Object.entries(titleStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={duplicateFilter}
              onChange={(event) =>
                setDuplicateFilter(event.target.value as DuplicateFilter)
              }
              className={selectClass}
              aria-label="Filtrar por duplicidad"
            >
              <option value="all">Toda duplicidad</option>
              <option value="low">Duplicidad baja</option>
              <option value="medium">Duplicidad media</option>
              <option value="high">Duplicidad alta</option>
            </select>
            {search || statusFilter !== "all" || duplicateFilter !== "all" ? (
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="col-span-2"
              >
                <X />
                Limpiar
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span>
            {filteredCandidates.length} de {candidates.length} propuestas
          </span>
        </div>
      </section>

      {loading ? (
        <Card className="border-border/80 bg-card/95 shadow-card">
          <CardContent className="grid min-h-64 place-items-center text-center">
            <div>
              <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
              <p className="mt-3 text-sm font-semibold">
                Cargando propuestas persistidas
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TitlePackageList
          candidates={filteredCandidates}
          canShare={canSharePackages}
          canRevise={canRevisePackages}
          revisingPackageId={revisingPackageId}
          onSelect={(candidate) => void selectCandidate(candidate)}
          onSharePackage={setReviewPackage}
          onRevisePackage={(group) => void revisePackage(group)}
          canDelete={canDeleteTitles}
          onDeleteFolder={(folder) =>
            setDeleteTarget({ kind: "folder", folder })
          }
        />
      )}

      <TitleDetailSheet
        candidate={selected}
        open={detailOpen}
        busy={busyId === selectedId}
        onOpenChange={setDetailOpen}
        onDecision={decide}
        onEdit={editTitle}
        onResolveDuplicate={resolveDuplicate}
        onShare={(candidate) => setReviewTitleId(candidate.id)}
        onDelete={(candidate) => setDeleteTarget({ kind: "title", candidate })}
        permissions={selectedPermissions}
      />
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>¿Estás seguro de eliminar?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "folder"
                ? `Se eliminarán ${deleteTarget.folder.candidates.length} títulos, sus versiones, evaluaciones y enlaces de revisión del expediente “${deleteTarget.folder.topic}”.`
                : `Se eliminará “${deleteTarget?.candidate.title ?? "este título"}” junto con su historial de evaluación.`}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Si algún título ya tiene una nota, I HERE bloqueará la operación.
            Primero debes eliminar esa nota desde su expediente.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? <LoaderCircle className="animate-spin" /> : null}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {reviewTitleId ? (
        <ReviewLinkDialog
          kind="title"
          entityId={reviewTitleId}
          entityTitle={
            candidates.find((candidate) => candidate.id === reviewTitleId)
              ?.title ?? "Título propuesto"
          }
          onClose={() => setReviewTitleId(null)}
        />
      ) : null}
      {reviewPackage ? (
        <ReviewLinkDialog
          kind="title-package"
          entityId={reviewPackage.id}
          entityTitle={reviewPackage.topic}
          entityCount={reviewPackage.candidates.length}
          proposalIds={reviewPackage.candidates.map(
            (candidate) => candidate.id,
          )}
          onClose={() => setReviewPackage(null)}
        />
      ) : null}
      <GenerateTitlesDialog
        open={generatorOpen}
        clientName={selectedClient?.name ?? "Cliente"}
        onOpenChange={setGeneratorOpen}
        onSuggest={suggestTitleBrief}
        onGenerate={generateTitles}
      />
      <TitleRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function deadlineAfter(milliseconds: number) {
  return Date.now() + milliseconds;
}
