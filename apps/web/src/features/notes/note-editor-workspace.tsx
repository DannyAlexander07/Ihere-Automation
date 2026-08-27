"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Eye,
  History,
  ImageIcon,
  ListPlus,
  LoaderCircle,
  Plus,
  Pencil,
  Save,
  Send,
  Sparkles,
  Share2,
  Trash2,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActivityOrb } from "@/components/brand/activity-orb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-provider";
import { hasClientPermission } from "@/features/auth/permissions";
import { ApiError } from "@/lib/api/api-client";
import {
  type ApiAiGenerationRun,
  generationFailureMessage,
  generationProgress,
  terminalGenerationStatuses,
  type TitleGenerationProgress,
  type TitleGenerationSummary,
} from "@/features/titles/ai-generation-api";
import { NoteGenerationDialog } from "./note-generation-dialog";
import { ReviewLinkDialog } from "@/features/client-review/review-link-dialog";
import { NoteStatusBadge } from "./note-status-badge";
import {
  compareNoteVersions,
  parseQaEvidence,
  parseQaFindings,
  type NoteVersion,
} from "./note-history";
import type { ApiNoteDetail, NoteBlock } from "./types";

type SourceForm = {
  id: string;
  type: "PRIMARY" | "ADECCO_KNOWLEDGE" | "RECOGNIZED_SECONDARY" | "CONTEXT";
  title: string;
  entity: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
};

type EditorForm = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  excerpt: string;
  authorName: string;
  authorRole: string;
  ctaText: string;
  ctaUrl: string;
  internalLinks: string;
  reason: string;
  blocks: NoteBlock[];
  sources: SourceForm[];
};

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

export function NoteEditorWorkspace({
  noteId,
  origin,
}: {
  noteId: string;
  origin?: "approval";
}) {
  const { apiFetch, user } = useAuth();
  const [note, setNote] = useState<ApiNoteDetail | null>(null);
  const [form, setForm] = useState<EditorForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationAutoStart, setGenerationAutoStart] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"preview" | "edit">("edit");
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | null
  >(null);
  const autoStartedNoteRef = useRef<string | null>(null);

  const load = useCallback(
    async (selectCurrent = false) => {
      setError(null);
      try {
        const nextNote = await apiFetch<ApiNoteDetail>(`notes/${noteId}`);
        setNote(nextNote);
        setForm(editorFrom(nextNote));
        setSelectedVersionNumber((selected) =>
          !selectCurrent &&
          selected &&
          nextNote.versions.some((item) => item.version === selected)
            ? selected
            : nextNote.currentVersion,
        );
      } catch (reason) {
        setError(messageFrom(reason));
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, noteId],
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const nextNote = await apiFetch<ApiNoteDetail>(`notes/${noteId}`);
        if (cancelled) return;
        setNote(nextNote);
        setForm(editorFrom(nextNote));
        setSelectedVersionNumber(nextNote.currentVersion);
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
  }, [apiFetch, noteId]);

  const qaActive =
    note?.status === "QA_QUEUED" || note?.status === "QA_RUNNING";
  const workflowActive = qaActive || note?.status === "GENERATING";
  useEffect(() => {
    if (!workflowActive) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, workflowActive]);

  const currentVersion = note?.versions.find(
    (version) => version.version === note.currentVersion,
  );
  const selectedVersion =
    note?.versions.find(
      (version) => version.version === selectedVersionNumber,
    ) ?? currentVersion;
  const viewingCurrent = selectedVersion?.version === note?.currentVersion;
  const currentQa = note?.qaEvaluations.find(
    (evaluation) => evaluation.version === note.currentVersion,
  );
  const selectedQa = note?.qaEvaluations.find(
    (evaluation) => evaluation.version === selectedVersion?.version,
  );
  const currentBlockers = Array.isArray(currentQa?.criticalBlockers)
    ? currentQa.criticalBlockers.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const selectedBlockers = Array.isArray(selectedQa?.criticalBlockers)
    ? selectedQa.criticalBlockers.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const visibleForm =
    viewingCurrent || !selectedVersion
      ? form
      : editorFromVersion(
          selectedVersion,
          note?.titleProposal.title ?? "",
          selectedVersion.changeReason ?? "",
        );
  const workflowEditable =
    note?.status === "DRAFT" || note?.status === "CHANGES_REQUESTED";
  const canCreateManualRevision =
    workflowEditable ||
    note?.status === "READY_FOR_REVIEW" ||
    note?.status === "EXPORTED";
  const canSave =
    viewingCurrent &&
    canCreateManualRevision &&
    hasClientPermission(user, "notes.edit", note?.clientId ?? "");
  const canGenerate =
    viewingCurrent &&
    workflowEditable &&
    hasClientPermission(user, "notes.edit", note?.clientId ?? "") &&
    hasClientPermission(user, "ai.generate", note?.clientId ?? "");
  const emptyInitialVersion = isEmptyInitialVersion(note, currentVersion);

  useEffect(() => {
    if (
      !note ||
      note.status !== "DRAFT" ||
      !emptyInitialVersion ||
      !canGenerate ||
      autoStartedNoteRef.current === note.id
    ) {
      return;
    }
    autoStartedNoteRef.current = note.id;
    setGenerationAutoStart(true);
    setGenerationOpen(true);
  }, [canGenerate, emptyInitialVersion, note]);
  const canQueueQa =
    viewingCurrent &&
    workflowEditable &&
    hasClientPermission(user, "notes.qa", note?.clientId ?? "");
  const canShare =
    viewingCurrent &&
    hasClientPermission(user, "review_links.manage", note?.clientId ?? "");
  const canReview =
    viewingCurrent &&
    hasClientPermission(user, "notes.review", note?.clientId ?? "");
  const canApprove =
    viewingCurrent &&
    hasClientPermission(user, "notes.approve", note?.clientId ?? "");
  const latestClientFeedback = (note?.clientReviewLinks ?? []).find(
    (link) =>
      link.version === note?.currentVersion &&
      link.decision &&
      link.decision.type !== "APPROVE",
  )?.decision;
  const differences =
    selectedVersion && currentVersion && !viewingCurrent
      ? compareNoteVersions(selectedVersion, currentVersion)
      : [];

  const save = async () => {
    if (!note || !form || !form.reason.trim()) {
      setError("Describe el motivo del cambio antes de guardar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sources = form.sources.map((source) => ({
        type: source.type,
        title: source.title,
        entity: source.entity,
        url: source.url,
        ...(source.publishedAt
          ? { publishedAt: `${source.publishedAt}T00:00:00.000Z` }
          : {}),
        accessedAt: `${source.accessedAt}T12:00:00.000Z`,
      }));
      const optionalTextFields = Object.fromEntries(
        Object.entries({
          metaTitle: form.metaTitle,
          metaDescription: form.metaDescription,
          slug: form.slug,
          excerpt: form.excerpt,
          authorName: form.authorName,
          authorRole: form.authorRole,
          ctaText: form.ctaText,
          ctaUrl: form.ctaUrl,
        })
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([, value]) => value.length > 0),
      );
      await apiFetch(`notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: note.currentVersion,
          title: form.title,
          ...optionalTextFields,
          internalLinks: form.internalLinks
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
          sources,
          content: { schemaVersion: 1, blocks: form.blocks },
          correctionType: "OTHER",
          reason: form.reason,
        }),
      });
      await load(true);
      setNotice("La nueva versión y su motivo quedaron registrados.");
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const queueQa = async () => {
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`notes/${note.id}/qa`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: note.currentVersion }),
      });
      await load(true);
      setNotice(
        "La versión quedó en cola para QA. El estado se actualizará automáticamente.",
      );
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const generateDraft = async (
    onProgress: (progress: TitleGenerationProgress) => void,
  ): Promise<TitleGenerationSummary> => {
    if (!note) throw new Error("La nota no está disponible.");
    const queued = await apiFetch<ApiAiGenerationRun>(
      `ai/generations/notes/${note.id}`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: note.currentVersion }),
      },
    );
    onProgress(generationProgress(queued));
    let current = queued;
    const deadline = Date.now() + 10 * 60_000;
    while (!terminalGenerationStatuses.has(current.status)) {
      if (Date.now() >= deadline) {
        throw new Error(
          "La generación sigue ejecutándose. Puedes cerrar esta ventana y volver a la nota en unos minutos.",
        );
      }
      await wait(1_500);
      current = await apiFetch<ApiAiGenerationRun>(
        `ai/generations/${queued.id}`,
      );
      onProgress(generationProgress(current));
    }
    await load(true);
    if (current.status !== "COMPLETED")
      throw new Error(generationFailureMessage(current));
    setNotice(
      "El borrador generado, sus fuentes y el QA quedaron registrados para revisión humana.",
    );
    return {
      proposalCount: current.noteVersions?.length ?? 1,
      costMicros: current.costMicros,
    };
  };

  const submitDecision = async () => {
    if (!note || !decision || decisionReason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`notes/${note.id}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: note.currentVersion,
          type: decision,
          reason: decisionReason,
        }),
      });
      setDecision(null);
      setDecisionReason("");
      await load(true);
      setNotice("La decisión humana y su justificación quedaron auditadas.");
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <Card>
        <CardContent className="grid min-h-[60vh] place-items-center">
          <LoaderCircle className="size-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  if (!note || !form || !visibleForm)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>No pudimos abrir la nota</AlertTitle>
        <AlertDescription>
          {error ?? "El expediente no está disponible."}
        </AlertDescription>
      </Alert>
    );

  if (note.status === "GENERATING" && emptyInitialVersion) {
    return (
      <NoteGenerationWaiting
        title={currentVersion?.title ?? note.titleProposal.title}
      />
    );
  }

  const editorialBrief = readEditorialBrief(note.briefSnapshot);
  const backDestination =
    origin === "approval"
      ? {
          href: "/automatizacion/aprobaciones",
          label: "Volver a aprobaciones",
        }
      : { href: "/automatizacion/notas", label: "Volver a notas" };

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card lg:flex-row lg:items-center">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href={backDestination.href}>
              <ArrowLeft />
              {backDestination.label}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <NoteStatusBadge status={note.status} />
            <Badge variant={viewingCurrent ? "outline" : "secondary"}>
              Vista v{selectedVersion?.version ?? note.currentVersion}
            </Badge>
            {!viewingCurrent ? (
              <Badge variant="outline">Vigente v{note.currentVersion}</Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {note.client.name}
            </span>
          </div>
          <h1 className="mt-2 truncate text-xl font-semibold sm:text-2xl">
            {selectedVersion?.title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {workflowEditable && viewingCurrent ? (
            <Button
              variant="outline"
              onClick={() => {
                setGenerationAutoStart(false);
                setGenerationOpen(true);
              }}
              disabled={busy || !canGenerate}
            >
              <Sparkles />
              {note.status === "CHANGES_REQUESTED"
                ? "Preparar corrección"
                : "Generar borrador"}
            </Button>
          ) : null}
          {canCreateManualRevision && viewingCurrent ? (
            <Button
              variant="outline"
              onClick={() => void save()}
              disabled={!canSave || busy}
            >
              <Save />
              {note.status === "EXPORTED"
                ? "Crear corrección"
                : note.status === "READY_FOR_REVIEW"
                  ? "Guardar nueva versión"
                  : "Guardar versión"}
            </Button>
          ) : null}
          {workflowEditable && viewingCurrent ? (
            <Button
              onClick={() => void queueQa()}
              disabled={
                !canQueueQa || busy || (currentVersion?.wordCount ?? 0) < 1
              }
            >
              <Send />
              Enviar a QA
            </Button>
          ) : null}
          {note.status === "READY_FOR_REVIEW" && canShare ? (
            <Button variant="outline" onClick={() => setReviewOpen(true)}>
              <Share2 />
              Compartir con cliente
            </Button>
          ) : null}
          {note.status === "READY_FOR_REVIEW" && (canReview || canApprove) ? (
            <>
              {canReview ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setDecision("REQUEST_CHANGES")}
                    disabled={busy}
                  >
                    <AlertTriangle />
                    Solicitar cambios
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setDecision("REJECT")}
                    disabled={busy}
                  >
                    <XCircle />
                    Rechazar
                  </Button>
                </>
              ) : null}
              {canApprove ? (
                <Button
                  onClick={() => setDecision("APPROVE")}
                  disabled={
                    busy ||
                    currentBlockers.length > 0 ||
                    (currentQa?.overallScore ?? 0) < 80
                  }
                >
                  <CheckCircle2 />
                  Aprobar
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Revisa la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {note.status === "CHANGES_REQUESTED" && latestClientFeedback ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle />
          <AlertTitle>Observación del cliente</AlertTitle>
          <AlertDescription>
            {latestClientFeedback.reason} La nueva versión deberá pasar QA y
            revisión humana antes de volver a compartirse.
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 />
          <AlertTitle>Cambio registrado</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {note.status === "EXPORTED" ? (
        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <FileCheck2 />
          <AlertTitle>La entrega publicada se conservará</AlertTitle>
          <AlertDescription>
            Edita el contenido y crea una corrección. I HERE abrirá una versión
            nueva en borrador, revocará los enlaces de revisión anteriores y
            mantendrá descargables los archivos ya entregados.
          </AlertDescription>
        </Alert>
      ) : null}
      {note.status === "READY_FOR_REVIEW" ? (
        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <Pencil />
          <AlertTitle>Puedes revisar y editar antes de compartir</AlertTitle>
          <AlertDescription>
            Si guardas un cambio, I HERE conservará esta versión y creará una
            nueva en borrador. La nueva versión deberá pasar nuevamente por QA
            antes de enviarse al cliente.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" />
              Historial de versiones
            </CardTitle>
            <CardDescription>
              Consulta una versión inmutable y compárala con la vigente.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64 sm:flex-row sm:items-center">
            <Label htmlFor="note-version" className="sr-only">
              Versión mostrada
            </Label>
            <select
              id="note-version"
              value={selectedVersion?.version ?? note.currentVersion}
              onChange={(event) =>
                setSelectedVersionNumber(Number(event.target.value))
              }
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm sm:min-w-56"
            >
              {note.versions.map((version) => (
                <option key={version.id} value={version.version}>
                  v{version.version}
                  {version.version === note.currentVersion ? " · vigente" : ""}
                  {` · ${formatVersionDate(version.createdAt)}`}
                </option>
              ))}
            </select>
            {!viewingCurrent ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedVersionNumber(note.currentVersion)}
              >
                Ver vigente
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {viewingCurrent ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Estás viendo la versión vigente. Elige una versión anterior para
              revisar sus cambios.
            </div>
          ) : differences.length ? (
            <div className="space-y-2" aria-label="Comparación de versiones">
              <div className="hidden grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Campo</span>
                <span>v{selectedVersion?.version}</span>
                <span aria-hidden="true" />
                <span>Vigente v{note.currentVersion}</span>
              </div>
              {differences.map((difference) => (
                <div
                  key={difference.key}
                  className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start"
                >
                  <p className="text-xs font-semibold">{difference.label}</p>
                  <VersionValue
                    label={`v${selectedVersion?.version}`}
                    value={difference.selectedValue}
                  />
                  <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
                  <VersionValue
                    label={`Vigente v${note.currentVersion}`}
                    value={difference.currentValue}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              No se detectan diferencias editoriales entre estas versiones.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px] min-[1920px]:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Brief bloqueado</CardTitle>
              <CardDescription>
                Contexto copiado del título aprobado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <BriefField
                label="Pregunta principal"
                value={editorialBrief.mainQuestion}
              />
              <BriefField
                label="Objetivo"
                value={note.titleProposal.objective}
              />
              <BriefField
                label="Audiencia"
                value={note.titleProposal.audience}
              />
              <BriefField
                label="Intención"
                value={note.titleProposal.searchIntent}
              />
              <BriefField label="Enfoque" value={note.titleProposal.focus} />
              <BriefField
                label="Respuesta temprana"
                value={editorialBrief.directAnswer}
              />
              <BriefField
                label="Estructura mínima"
                value={editorialBrief.structure}
              />
              <BriefField
                label="Evidencia requerida"
                value={editorialBrief.evidence}
              />
              <BriefField
                label="Aporte que debe confirmar Adecco"
                value={editorialBrief.adeccoInput}
              />
              <BriefField
                label="CTA y enlaces"
                value={editorialBrief.conversion}
              />
              <BriefField
                label="Límites institucionales"
                value={editorialBrief.guardrails}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Versión observada · v{selectedVersion?.version}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              <BriefField
                label="Palabras"
                value={String(selectedVersion?.wordCount ?? 0)}
              />
              <BriefField
                label="Fuentes"
                value={String(selectedVersion?.sources.length ?? 0)}
              />
              <BriefField
                label="Origen"
                value={versionSourceLabel(selectedVersion?.source)}
              />
              <BriefField
                label="Huella"
                value={selectedVersion?.contentHash.slice(0, 10) ?? "—"}
              />
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-3" aria-label="Editor de contenido">
          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  Revisión interna antes del cliente
                </p>
                <p className="text-xs text-muted-foreground">
                  Comprueba cómo se leerá la nota o vuelve al editor para
                  ajustar contenido y metadatos.
                </p>
              </div>
              <div className="flex rounded-lg border bg-background p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={editorMode === "preview" ? "secondary" : "ghost"}
                  onClick={() => setEditorMode("preview")}
                >
                  <Eye />
                  Vista previa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editorMode === "edit" ? "secondary" : "ghost"}
                  onClick={() => setEditorMode("edit")}
                >
                  <Pencil />
                  Editar
                </Button>
              </div>
            </CardContent>
          </Card>

          <ImageProposalEditor
            key={`${selectedVersion?.version ?? note.currentVersion}:${note.imageProposals?.find((item) => item.version === selectedVersion?.version)?.status ?? "none"}:${note.imageProposals?.find((item) => item.version === selectedVersion?.version)?.concept ?? ""}`}
            noteId={note.id}
            version={selectedVersion?.version ?? note.currentVersion}
            proposal={
              note.imageProposals?.find(
                (item) => item.version === selectedVersion?.version,
              ) ?? null
            }
            editable={
              viewingCurrent &&
              hasClientPermission(user, "notes.edit", note.clientId)
            }
            canReview={viewingCurrent && canReview}
            canApprove={viewingCurrent && canApprove}
            onSaved={async (message) => {
              await load(true);
              setNotice(message);
            }}
            onError={setError}
          />

          {editorMode === "preview" ? (
            <NoteArticlePreview form={visibleForm} />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Metadatos y atribución
                  </CardTitle>
                  <CardDescription>
                    Los cambios se guardan como una versión inmutable nueva.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <EditorInput
                    label="Título visible"
                    value={visibleForm.title}
                    onChange={(value) => updateForm(setForm, "title", value)}
                    disabled={!canSave}
                    wide
                  />
                  <EditorInput
                    label="Meta title"
                    value={visibleForm.metaTitle}
                    onChange={(value) =>
                      updateForm(setForm, "metaTitle", value)
                    }
                    disabled={!canSave}
                  />
                  <EditorInput
                    label="Slug"
                    value={visibleForm.slug}
                    onChange={(value) => updateForm(setForm, "slug", value)}
                    disabled={!canSave}
                  />
                  <EditorArea
                    label="Meta description"
                    value={visibleForm.metaDescription}
                    onChange={(value) =>
                      updateForm(setForm, "metaDescription", value)
                    }
                    disabled={!canSave}
                    wide
                  />
                  <EditorArea
                    label="Extracto"
                    value={visibleForm.excerpt}
                    onChange={(value) => updateForm(setForm, "excerpt", value)}
                    disabled={!canSave}
                    wide
                  />
                  <EditorInput
                    label="Autor o especialista"
                    value={visibleForm.authorName}
                    onChange={(value) =>
                      updateForm(setForm, "authorName", value)
                    }
                    disabled={!canSave}
                  />
                  <EditorInput
                    label="Cargo o especialidad"
                    value={visibleForm.authorRole}
                    onChange={(value) =>
                      updateForm(setForm, "authorRole", value)
                    }
                    disabled={!canSave}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      Contenido estructurado
                    </CardTitle>
                    <CardDescription>
                      Encabezados, párrafos, listas, citas y destacados seguros.
                    </CardDescription>
                  </div>
                  {canSave ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                blocks: [
                                  ...current.blocks,
                                  newBlock("paragraph"),
                                ],
                              }
                            : current,
                        )
                      }
                    >
                      <Plus />
                      Bloque
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleForm.blocks.length ? (
                    visibleForm.blocks.map((block, index) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        index={index}
                        disabled={!canSave}
                        onChange={(next) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  blocks: current.blocks.map((item) =>
                                    item.id === block.id ? next : item,
                                  ),
                                }
                              : current,
                          )
                        }
                        onRemove={() =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  blocks: current.blocks.filter(
                                    (item) => item.id !== block.id,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed p-6 text-center">
                      <FileCheck2 className="mx-auto size-6 text-primary" />
                      <p className="mt-2 text-sm font-semibold">
                        La nota todavía no tiene contenido
                      </p>
                      {canSave ? (
                        <Button
                          className="mt-3"
                          variant="outline"
                          onClick={() =>
                            setForm((current) =>
                              current
                                ? {
                                    ...current,
                                    blocks: [newBlock("paragraph")],
                                  }
                                : current,
                            )
                          }
                        >
                          <ListPlus />
                          Agregar primer bloque
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      Fuentes y enlaces
                    </CardTitle>
                    <CardDescription>
                      Entidad, prioridad, URL y fechas verificables.
                    </CardDescription>
                  </div>
                  {canSave ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                sources: [...current.sources, newSource()],
                              }
                            : current,
                        )
                      }
                    >
                      <Plus />
                      Fuente
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleForm.sources.map((source, index) => (
                    <SourceEditor
                      key={source.id}
                      source={source}
                      index={index}
                      disabled={!canSave}
                      onChange={(next) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                sources: current.sources.map((item) =>
                                  item.id === source.id ? next : item,
                                ),
                              }
                            : current,
                        )
                      }
                      onRemove={() =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                sources: current.sources.filter(
                                  (item) => item.id !== source.id,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  ))}
                  <EditorArea
                    label="Enlaces internos, uno por línea"
                    value={visibleForm.internalLinks}
                    onChange={(value) =>
                      updateForm(setForm, "internalLinks", value)
                    }
                    disabled={!canSave}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Orientación a la acción
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <EditorArea
                    label="CTA"
                    value={visibleForm.ctaText}
                    onChange={(value) => updateForm(setForm, "ctaText", value)}
                    disabled={!canSave}
                    wide
                  />
                  <EditorInput
                    label="URL del CTA"
                    value={visibleForm.ctaUrl}
                    onChange={(value) => updateForm(setForm, "ctaUrl", value)}
                    disabled={!canSave}
                    wide
                  />
                  <EditorArea
                    label={
                      viewingCurrent
                        ? "Motivo de esta nueva versión"
                        : "Motivo registrado"
                    }
                    value={visibleForm.reason}
                    onChange={(value) => updateForm(setForm, "reason", value)}
                    disabled={!canSave}
                    wide
                  />
                </CardContent>
              </Card>
            </>
          )}
        </section>

        <aside className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Control de calidad · v{selectedVersion?.version}
              </CardTitle>
              <CardDescription>
                Rúbrica versionada de 100 puntos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {qaActive && viewingCurrent ? (
                <div className="py-5 text-center">
                  <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
                  <p className="mt-2 text-xs font-semibold">QA en ejecución</p>
                </div>
              ) : selectedQa ? (
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="font-heading text-3xl font-semibold">
                        {selectedQa.overallScore ?? 0}
                        <span className="text-sm text-muted-foreground">
                          /100
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedQa.summary}
                      </p>
                    </div>
                    <Badge variant="outline">{selectedQa.verdict}</Badge>
                  </div>
                  <Progress value={selectedQa.overallScore ?? 0} />
                  {selectedBlockers.length ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                      <p className="font-semibold">Bloqueos críticos</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {selectedBlockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {selectedQa.results.map((result) => (
                      <QaResultCard key={result.id} result={result} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Motor: {selectedQa.results[0]?.ruleVersion ?? "—"}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-center">
                  <ShieldCheckIcon />
                  <p className="mt-2 text-xs font-semibold">
                    Sin QA para esta versión
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Guarda contenido y envíalo a evaluación.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Historial de decisiones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {note.decisions.length ? (
                note.decisions.map((item) => (
                  <div key={item.id} className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-semibold">
                      {item.type} · v{item.version}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  Todavía no hay decisiones humanas.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "APPROVE"
                ? "Aprobar versión"
                : decision === "REJECT"
                  ? "Rechazar nota"
                  : "Solicitar cambios"}
            </DialogTitle>
            <DialogDescription>
              La decisión quedará asociada a tu usuario, versión y fecha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decision-reason">Justificación</Label>
            <Textarea
              id="decision-reason"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="Explica la decisión con al menos 5 caracteres."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitDecision()}
              disabled={busy || decisionReason.trim().length < 5}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Confirmar decisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NoteGenerationDialog
        open={generationOpen}
        onOpenChange={(open) => {
          setGenerationOpen(open);
          if (!open) setGenerationAutoStart(false);
        }}
        onGenerate={generateDraft}
        revisionFeedback={latestClientFeedback?.reason}
        autoStart={generationAutoStart}
      />
      {reviewOpen ? (
        <ReviewLinkDialog
          kind="note"
          entityId={note.id}
          entityTitle={currentVersion?.title ?? note.titleProposal.title}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function NoteGenerationWaiting({ title }: { title: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid min-h-[66vh] place-items-center bg-gradient-to-br from-secondary/60 via-card to-accent/20 p-6 text-center sm:p-10">
        <div className="max-w-xl" aria-live="polite">
          <ActivityOrb state="composing" />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Borrador en preparación
          </p>
          <h1 className="mt-2 text-balance text-xl font-bold sm:text-2xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            I HERE está investigando fuentes, redactando la nota completa y
            ejecutando el control de calidad. Esta vista se actualizará
            automáticamente cuando la versión esté lista para tu revisión.
          </p>
          <div className="mx-auto mt-6 grid max-w-lg gap-2 text-left text-sm sm:grid-cols-3">
            {[
              "Fuentes verificables",
              "Redacción editorial",
              "Auditoría y QA",
            ].map((stage) => (
              <div
                key={stage}
                className="rounded-xl border bg-card/80 px-3 py-3 font-medium shadow-sm"
              >
                <LoaderCircle className="mr-2 inline size-4 animate-spin text-primary" />
                {stage}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function isEmptyInitialVersion(
  note: ApiNoteDetail | null,
  version: ApiNoteDetail["versions"][number] | undefined,
) {
  return Boolean(
    note &&
    note.currentVersion === 1 &&
    version?.version === 1 &&
    version.wordCount === 0 &&
    version.sources.length === 0 &&
    version.content.blocks.length === 0,
  );
}

function versionSourceLabel(source: string | undefined) {
  if (source === "AI_ASSISTED") return "Asistencia editorial";
  if (source === "HUMAN") return "Edición humana";
  if (source === "SYSTEM") return "Sistema";
  return "—";
}

function NoteArticlePreview({ form }: { form: EditorForm }) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-card">
      <header className="border-b bg-[radial-gradient(circle_at_90%_0%,rgba(22,142,234,.12),transparent_35%),#fff] px-5 py-7 sm:px-8 sm:py-10">
        <Badge variant="secondary">Vista previa interna</Badge>
        <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
          {form.title || "Nota sin título"}
        </h2>
        {form.excerpt ? (
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            {form.excerpt}
          </p>
        ) : null}
        {form.authorName ? (
          <p className="mt-4 text-sm font-semibold">
            Por {form.authorName}
            {form.authorRole ? ` · ${form.authorRole}` : ""}
          </p>
        ) : null}
      </header>
      <div className="mx-auto min-w-0 max-w-3xl space-y-5 px-5 py-7 text-[15px] leading-7 [overflow-wrap:anywhere] sm:px-8 sm:py-10">
        {form.blocks.length ? (
          form.blocks.map((block) => (
            <PreviewBlock key={block.id} block={block} />
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-center text-muted-foreground">
            La nota aún no tiene contenido para previsualizar.
          </p>
        )}
        {form.ctaText ? (
          <aside className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="font-semibold">Siguiente paso</p>
            <p className="mt-1">{form.ctaText}</p>
            {form.ctaUrl ? (
              <a
                className="mt-2 block break-all text-sm font-semibold text-primary underline underline-offset-4"
                href={cleanExternalUrl(form.ctaUrl) ?? form.ctaUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                Abrir información relacionada
              </a>
            ) : null}
          </aside>
        ) : null}
        {form.sources.length ? (
          <footer className="border-t pt-5">
            <h3 className="font-semibold">Fuentes consultadas</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {form.sources.map((source) => {
                const sourceUrl = cleanExternalUrl(source.url);
                return (
                  <li
                    key={source.id}
                    className="break-words [overflow-wrap:anywhere]"
                  >
                    {sourceUrl ? (
                      <a
                        className="font-medium text-primary underline underline-offset-4"
                        href={sourceUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {source.entity}: {source.title}
                      </a>
                    ) : (
                      <>
                        {source.entity}: {source.title}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </footer>
        ) : null}
      </div>
    </article>
  );
}

function PreviewBlock({ block }: { block: NoteBlock }) {
  if (block.type === "heading") {
    const className =
      block.level === 2 ? "text-xl sm:text-2xl" : "text-lg sm:text-xl";
    return (
      <h3
        className={`${className} break-words pt-2 font-bold leading-tight [overflow-wrap:anywhere]`}
      >
        {renderInlineLinks(block.text)}
      </h3>
    );
  }
  if (block.type === "bullet_list" || block.type === "ordered_list") {
    const ListTag = block.type === "ordered_list" ? "ol" : "ul";
    return (
      <ListTag
        className={`${block.type === "ordered_list" ? "list-decimal" : "list-disc"} min-w-0 space-y-1 pl-6 [overflow-wrap:anywhere]`}
      >
        {(block.items ?? []).map((item, index) => (
          <li key={`${block.id}-${index}`}>{renderInlineLinks(item)}</li>
        ))}
      </ListTag>
    );
  }
  if (block.type === "quote")
    return (
      <blockquote className="break-words border-l-4 border-primary pl-4 italic text-muted-foreground [overflow-wrap:anywhere]">
        {renderInlineLinks(block.text)}
      </blockquote>
    );
  if (block.type === "callout")
    return (
      <aside className="break-words rounded-xl border bg-secondary/40 p-4 font-medium [overflow-wrap:anywhere]">
        {renderInlineLinks(block.text)}
      </aside>
    );
  return (
    <p className="min-w-0 break-words [overflow-wrap:anywhere]">
      {renderInlineLinks(block.text)}
    </p>
  );
}

function renderInlineLinks(text: string | undefined) {
  if (!text) return null;
  const pattern = /\[([^\]]+)]\(\s*(https?:\/\/\S+?)\s*\)/gi;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const href = cleanExternalUrl(match[2]);
    nodes.push(
      href ? (
        <a
          className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
          href={href}
          key={`${index}-${href}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {match[1]}
        </a>
      ) : (
        match[0]
      ),
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : text;
}

function cleanExternalUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function editorFrom(note: ApiNoteDetail): EditorForm {
  const version =
    note.versions.find((item) => item.version === note.currentVersion) ??
    note.versions[0];
  return editorFromVersion(version, note.titleProposal.title);
}

function editorFromVersion(
  version: NoteVersion | undefined,
  fallbackTitle: string,
  reason = "",
): EditorForm {
  return {
    title: version?.title ?? fallbackTitle,
    metaTitle: version?.metaTitle ?? "",
    metaDescription: version?.metaDescription ?? "",
    slug: version?.slug ?? "",
    excerpt: version?.excerpt ?? "",
    authorName: version?.authorName ?? "",
    authorRole: version?.authorRole ?? "",
    ctaText: version?.ctaText ?? "",
    ctaUrl: version?.ctaUrl ?? "",
    internalLinks: Array.isArray(version?.internalLinks)
      ? version.internalLinks
          .filter((value): value is string => typeof value === "string")
          .join("\n")
      : "",
    reason,
    blocks: version?.content.blocks ?? [],
    sources: (version?.sources ?? []).map((source) => ({
      ...source,
      publishedAt: source.publishedAt?.slice(0, 10) ?? "",
      accessedAt: source.accessedAt.slice(0, 10),
    })),
  };
}

function updateForm<K extends keyof EditorForm>(
  setter: React.Dispatch<React.SetStateAction<EditorForm | null>>,
  key: K,
  value: EditorForm[K],
) {
  setter((current) => (current ? { ...current, [key]: value } : current));
}
function newBlock(type: NoteBlock["type"]): NoteBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return type === "heading"
    ? { id, type, level: 2, text: "" }
    : type === "bullet_list" || type === "ordered_list"
      ? { id, type, items: [""] }
      : { id, type, text: "" };
}
function newSource(): SourceForm {
  return {
    id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "CONTEXT",
    title: "",
    entity: "",
    url: "",
    publishedAt: "",
    accessedAt: new Date().toISOString().slice(0, 10),
  };
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 leading-5">{value}</p>
    </div>
  );
}

function readEditorialBrief(snapshot: Record<string, unknown>) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (value: unknown, fallback = "Pendiente de confirmar") =>
    typeof value === "string" && value.trim() ? value : fallback;
  const list = (value: unknown, fallback: string) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .join(" · ") || fallback
      : fallback;

  const directAnswer = object(snapshot.directAnswerContract);
  const structure = object(snapshot.editorialStructure);
  const evidence = object(snapshot.evidencePlan);
  const conversion = object(snapshot.conversion);

  return {
    mainQuestion: text(snapshot.mainQuestion),
    directAnswer: `${text(directAnswer.placement, "Primeros dos párrafos")}: ${text(directAnswer.requirement)}`,
    structure: list(
      structure.requiredH2,
      "La estructura debe definirse antes de generar el borrador.",
    ),
    evidence: `${list(evidence.sourcePriority, "Definir fuentes verificables")}. ${text(evidence.claimRule, "Cada afirmación importante debe conservar su fuente.")}`,
    adeccoInput: list(
      evidence.adeccoInputRequired,
      "Confirmar el aporte original y la información institucional autorizada.",
    ),
    conversion: `${text(conversion.serviceRequirement)} ${text(conversion.ctaRequirement)} ${text(conversion.internalLinksRequirement)}`,
    guardrails: list(
      snapshot.institutionalGuardrails,
      "No inventar información ni prometer resultados absolutos.",
    ),
  };
}

function VersionValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-background px-2.5 py-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
        {label}
      </p>
      <p className="break-words text-xs leading-5">{value}</p>
    </div>
  );
}

function QaResultCard({
  result,
}: {
  result: ApiNoteDetail["qaEvaluations"][number]["results"][number];
}) {
  const findings = parseQaFindings(result.findings);
  const evidence = parseQaEvidence(result.evidence);
  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold">
          {dimensionLabel(result.dimension)}
        </p>
        <span className="shrink-0 text-xs font-semibold">
          {result.score}/{result.maxScore}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        {result.summary}
      </p>
      {findings.length ? (
        <div className="mt-2 border-t pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hallazgos
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[10px] leading-4">
            {findings.map((finding, index) => (
              <li key={`${result.id}-finding-${index}`}>{finding}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evidence.length ? (
        <dl className="mt-2 grid grid-cols-2 gap-1.5 border-t pt-2">
          {evidence.map((item) => (
            <div
              key={`${result.id}-evidence-${item.key}`}
              className="min-w-0 rounded-md bg-muted/50 p-1.5"
            >
              <dt className="text-[9px] font-medium leading-3 text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-0.5 break-words text-[10px] font-semibold leading-4">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function formatVersionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function EditorInput({
  label,
  value,
  onChange,
  disabled,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  wide?: boolean;
}) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1.5"
      />
    </div>
  );
}
function EditorArea({
  label,
  value,
  onChange,
  disabled,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  wide?: boolean;
}) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1.5 min-h-24"
      />
    </div>
  );
}

function BlockEditor({
  block,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  block: NoteBlock;
  index: number;
  disabled: boolean;
  onChange: (block: NoteBlock) => void;
  onRemove: () => void;
}) {
  const value = block.items?.join("\n") ?? block.text ?? "";
  const changeType = (type: NoteBlock["type"]) =>
    onChange(
      type === "heading"
        ? { id: block.id, type, level: 2, text: value }
        : type === "bullet_list" || type === "ordered_list"
          ? { id: block.id, type, items: value.split(/\r?\n/) }
          : { id: block.id, type, text: value },
    );
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">
          BLOQUE {index + 1}
        </span>
        <select
          value={block.type}
          onChange={(event) =>
            changeType(event.target.value as NoteBlock["type"])
          }
          disabled={disabled}
          className="h-8 rounded-lg border bg-card px-2 text-xs"
          aria-label={`Tipo del bloque ${index + 1}`}
        >
          <option value="heading">Encabezado</option>
          <option value="paragraph">Párrafo</option>
          <option value="bullet_list">Lista con viñetas</option>
          <option value="ordered_list">Lista numerada</option>
          <option value="quote">Cita</option>
          <option value="callout">Destacado</option>
        </select>
        {block.type === "heading" ? (
          <select
            value={block.level ?? 2}
            onChange={(event) =>
              onChange({
                ...block,
                level: Number(event.target.value) as 2 | 3 | 4,
              })
            }
            disabled={disabled}
            className="h-8 rounded-lg border bg-card px-2 text-xs"
            aria-label={`Nivel del encabezado ${index + 1}`}
          >
            <option value="2">H2</option>
            <option value="3">H3</option>
            <option value="4">H4</option>
          </select>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Eliminar bloque ${index + 1}`}
        >
          <Trash2 />
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(event) =>
          onChange(
            block.items
              ? { ...block, items: event.target.value.split(/\r?\n/) }
              : { ...block, text: event.target.value },
          )
        }
        disabled={disabled}
        className="mt-2 min-h-28"
        placeholder={
          block.items
            ? "Un elemento por línea"
            : "Escribe el contenido del bloque"
        }
        aria-label={`Contenido del bloque ${index + 1}`}
      />
    </div>
  );
}

function SourceEditor({
  source,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  source: SourceForm;
  index: number;
  disabled: boolean;
  onChange: (source: SourceForm) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">
          FUENTE {index + 1}
        </span>
        <select
          value={source.type}
          onChange={(event) =>
            onChange({
              ...source,
              type: event.target.value as SourceForm["type"],
            })
          }
          disabled={disabled}
          className="h-8 rounded-lg border bg-card px-2 text-xs"
          aria-label={`Prioridad de la fuente ${index + 1}`}
        >
          <option value="PRIMARY">Primaria</option>
          <option value="ADECCO_KNOWLEDGE">Conocimiento Adecco</option>
          <option value="RECOGNIZED_SECONDARY">Secundaria reconocida</option>
          <option value="CONTEXT">Contexto</option>
        </select>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Eliminar fuente ${index + 1}`}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={source.title}
          onChange={(event) =>
            onChange({ ...source, title: event.target.value })
          }
          disabled={disabled}
          placeholder="Título de la fuente"
          aria-label={`Título de la fuente ${index + 1}`}
        />
        <Input
          value={source.entity}
          onChange={(event) =>
            onChange({ ...source, entity: event.target.value })
          }
          disabled={disabled}
          placeholder="Entidad responsable"
          aria-label={`Entidad de la fuente ${index + 1}`}
        />
        <Input
          value={source.url}
          onChange={(event) => onChange({ ...source, url: event.target.value })}
          disabled={disabled}
          placeholder="https://…"
          className="sm:col-span-2"
          aria-label={`URL de la fuente ${index + 1}`}
        />
        <div>
          <Label className="text-[10px]">Fecha de publicación</Label>
          <Input
            type="date"
            value={source.publishedAt}
            onChange={(event) =>
              onChange({ ...source, publishedAt: event.target.value })
            }
            disabled={disabled}
            aria-label={`Fecha de publicación de la fuente ${index + 1}`}
          />
        </div>
        <div>
          <Label className="text-[10px]">Fecha de consulta</Label>
          <Input
            type="date"
            value={source.accessedAt}
            onChange={(event) =>
              onChange({ ...source, accessedAt: event.target.value })
            }
            disabled={disabled}
            aria-label={`Fecha de consulta de la fuente ${index + 1}`}
          />
        </div>
      </div>
    </div>
  );
}

type ImageProposal = NonNullable<ApiNoteDetail["imageProposals"]>[number];

function ImageProposalEditor({
  noteId,
  version,
  proposal,
  editable,
  canReview,
  canApprove,
  onSaved,
  onError,
}: {
  noteId: string;
  version: number;
  proposal: ImageProposal | null;
  editable: boolean;
  canReview: boolean;
  canApprove: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { apiFetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<
    "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | null
  >(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState(() => imageForm(proposal));

  const save = async () => {
    if (
      form.concept.trim().length < 10 ||
      form.prompt.trim().length < 20 ||
      form.altText.trim().length < 8
    ) {
      onError(
        "Completa el concepto, las instrucciones visuales y el texto alternativo.",
      );
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`notes/${noteId}/image-proposal`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: version,
          concept: form.concept.trim(),
          prompt: form.prompt.trim(),
          altText: form.altText.trim(),
          ...(form.caption.trim() ? { caption: form.caption.trim() } : {}),
          ...(form.referenceUrl.trim()
            ? { referenceUrl: form.referenceUrl.trim() }
            : {}),
        }),
      });
      await onSaved(
        "La propuesta visual quedó guardada y pendiente de aprobación.",
      );
    } catch (cause) {
      onError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  };

  const decide = async () => {
    if (!decision || reason.trim().length < 5) return;
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`notes/${noteId}/image-proposal/decision`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: version,
          status: decision,
          reason: reason.trim(),
        }),
      });
      await onSaved(
        decision === "APPROVED"
          ? "La propuesta visual quedó aprobada."
          : "La decisión sobre la imagen quedó registrada.",
      );
    } catch (cause) {
      onError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  };

  const status = proposal?.status ?? "PROPOSED";
  return (
    <Card className="overflow-hidden border-sky-200">
      <CardHeader className="gap-3 bg-sky-50/60 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4 text-sky-700" />
            Propuesta visual · v{version}
          </CardTitle>
          <CardDescription>
            Concepto, producción y accesibilidad de la imagen que acompañará la
            nota.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{imageStatusLabel(status)}</Badge>
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil />
              {editing ? "Cerrar edición visual" : "Editar propuesta visual"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField
              label="Concepto visual"
              value={form.concept}
              onChange={(value) =>
                setForm((current) => ({ ...current, concept: value }))
              }
              wide
              area
            />
            <ImageField
              label="Instrucciones de producción"
              value={form.prompt}
              onChange={(value) =>
                setForm((current) => ({ ...current, prompt: value }))
              }
              wide
              area
            />
            <ImageField
              label="Texto alternativo"
              value={form.altText}
              onChange={(value) =>
                setForm((current) => ({ ...current, altText: value }))
              }
              wide
            />
            <ImageField
              label="Pie de imagen"
              value={form.caption}
              onChange={(value) =>
                setForm((current) => ({ ...current, caption: value }))
              }
            />
            <ImageField
              label="URL de referencia visual"
              value={form.referenceUrl}
              onChange={(value) =>
                setForm((current) => ({ ...current, referenceUrl: value }))
              }
            />
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={() => void save()} disabled={busy}>
                <Save />
                Guardar propuesta
              </Button>
            </div>
          </div>
        ) : proposal ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <BriefField label="Concepto" value={proposal.concept} />
            <BriefField label="Texto alternativo" value={proposal.altText} />
            <div className="sm:col-span-2">
              <BriefField
                label="Instrucciones de producción"
                value={proposal.prompt}
              />
            </div>
            {proposal.caption ? (
              <BriefField label="Pie sugerido" value={proposal.caption} />
            ) : null}
            {proposal.referenceUrl ? (
              <a
                href={proposal.referenceUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm font-semibold text-primary hover:underline"
              >
                Abrir referencia visual
              </a>
            ) : null}
            {proposal.decisionReason ? (
              <div className="sm:col-span-2 rounded-xl bg-muted/40 p-3 text-sm">
                <strong>Decisión:</strong> {proposal.decisionReason}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Todavía no existe una propuesta visual para esta versión. Puedes
            crearla desde Editar.
          </p>
        )}
        {proposal && (canReview || canApprove) ? (
          <div className="border-t pt-4">
            <div className="flex flex-wrap gap-2">
              {canApprove ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDecision("APPROVED")}
                >
                  <CheckCircle2 />
                  Aprobar imagen
                </Button>
              ) : null}
              {canReview ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDecision("CHANGES_REQUESTED")}
                  >
                    <AlertTriangle />
                    Pedir ajuste
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDecision("REJECTED")}
                  >
                    <XCircle />
                    Rechazar
                  </Button>
                </>
              ) : null}
            </div>
            {decision ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  autoComplete="off"
                  placeholder="Motivo de la decisión visual"
                />
                <Button
                  onClick={() => void decide()}
                  disabled={busy || reason.trim().length < 5}
                >
                  Confirmar
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function imageForm(proposal: ImageProposal | null) {
  return {
    concept: proposal?.concept ?? "",
    prompt: proposal?.prompt ?? "",
    altText: proposal?.altText ?? "",
    caption: proposal?.caption ?? "",
    referenceUrl: proposal?.referenceUrl ?? "",
  };
}
function imageStatusLabel(status: ImageProposal["status"] | "PROPOSED") {
  return (
    {
      PROPOSED: "Pendiente de aprobación",
      APPROVED: "Aprobada",
      CHANGES_REQUESTED: "Cambios solicitados",
      REJECTED: "Rechazada",
    } as const
  )[status];
}
function ImageField({
  label,
  value,
  onChange,
  area = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label>{label}</Label>
      {area ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          className="min-h-24"
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
        />
      )}
    </div>
  );
}

function ShieldCheckIcon() {
  return <FileCheck2 className="mx-auto size-6 text-primary" />;
}
function dimensionLabel(value: string) {
  return (
    (
      {
        INTENT_UTILITY: "Intención y utilidad",
        ORIGINALITY_EVIDENCE: "Originalidad y evidencia",
        ORGANIZATION_CLARITY: "Organización y claridad",
        SEO_EDITORIAL: "SEO editorial",
        GEO_AEO_CITABILITY: "GEO, AEO y citabilidad",
        ACTION_ORIENTATION: "Orientación a la acción",
        FINAL_QUALITY: "Calidad final",
      } as Record<string, string>
    )[value] ?? value
  );
}
function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
