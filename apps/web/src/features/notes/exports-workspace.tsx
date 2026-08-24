"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  FileDown,
  FileText,
  FileType2,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api/api-client";
import { NoteStatusBadge } from "./note-status-badge";
import { ExportDispatchDialog } from "./export-dispatch-dialog";
import type { ApiNoteSummary, ExportArtifactSummary } from "./types";

type ExportFormat = ExportArtifactSummary["format"];

const formats: Array<{
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileCode2;
}> = [
  {
    value: "HTML",
    label: "HTML",
    description: "Código limpio para publicación",
    icon: FileCode2,
  },
  {
    value: "DOCX",
    label: "Word",
    description: "Documento editable y diagramado",
    icon: FileText,
  },
  {
    value: "PDF",
    label: "PDF",
    description: "Entregable listo para compartir",
    icon: FileType2,
  },
];

export function ExportsWorkspace() {
  const { apiFetch, apiFetchResponse } = useAuth();
  const [notes, setNotes] = useState<ApiNoteSummary[]>([]);
  const [artifacts, setArtifacts] = useState<ExportArtifactSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deliveryArtifact, setDeliveryArtifact] =
    useState<ExportArtifactSummary | null>(null);
  const [verificationArtifact, setVerificationArtifact] =
    useState<ExportArtifactSummary | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (background) setRefreshing(true);
      try {
        const [nextNotes, nextArtifacts] = await Promise.all([
          apiFetch<ApiNoteSummary[]>("notes"),
          apiFetch<ExportArtifactSummary[]>("exports"),
        ]);
        setNotes(nextNotes);
        setArtifacts(nextArtifacts);
        setNotice((current) =>
          current?.title === "No pudimos cargar exportaciones" ? null : current,
        );
      } catch (error) {
        setNotice({
          tone: "error",
          title: "No pudimos cargar exportaciones",
          message: messageFrom(error),
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const processing = artifacts.some((artifact) =>
    ["QUEUED", "GENERATING"].includes(artifact.status),
  );
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void load(true), 1_500);
    return () => window.clearInterval(timer);
  }, [load, processing]);

  const eligibleNotes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es");
    return notes.filter((note) => {
      if (!["APPROVED", "EXPORTED"].includes(note.status)) return false;
      const title = note.versions[0]?.title ?? "";
      return (
        !normalized ||
        `${title} ${note.client.name}`
          .toLocaleLowerCase("es")
          .includes(normalized)
      );
    });
  }, [notes, search]);

  const stats = useMemo(
    () => ({
      ready: artifacts.filter((artifact) => artifact.status === "READY").length,
      processing: artifacts.filter((artifact) =>
        ["QUEUED", "GENERATING"].includes(artifact.status),
      ).length,
      failed: artifacts.filter((artifact) =>
        ["FAILED", "INVALID"].includes(artifact.status),
      ).length,
    }),
    [artifacts],
  );

  const requestExport = async (note: ApiNoteSummary, format: ExportFormat) => {
    const key = `${note.id}:${format}`;
    setBusyKey(key);
    setNotice(null);
    try {
      await apiFetch<{ id: string; status: ExportArtifactSummary["status"] }>(
        `exports/notes/${note.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: note.currentVersion,
            format,
          }),
        },
      );
      setNotice({
        tone: "success",
        title: "Exportación registrada",
        message: `${format} quedó en cola. I HERE verificará el archivo antes de habilitar la descarga.`,
      });
      await load(true);
    } catch (error) {
      setNotice({
        tone: "error",
        title: "No pudimos generar el archivo",
        message: messageFrom(error),
      });
    } finally {
      setBusyKey(null);
    }
  };

  const download = async (artifact: ExportArtifactSummary) => {
    setBusyKey(`download:${artifact.id}`);
    setNotice(null);
    try {
      const response = await apiFetchResponse(
        `exports/${artifact.id}/download`,
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        artifact.fileName ??
        `nota-v${artifact.version}.${artifact.format.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice({
        tone: "success",
        title: "Descarga verificada",
        message:
          "El servidor comprobó tamaño y hash antes de entregar el archivo.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "No pudimos descargar el archivo",
        message: messageFrom(error),
      });
      void load(true);
    } finally {
      setBusyKey(null);
    }
  };

  const verify = async (
    artifact: ExportArtifactSummary,
    checklist: {
      visualCheckConfirmed: boolean;
      contentParityConfirmed: boolean;
      linksAndMetadataConfirmed: boolean;
      notes: string;
    },
  ) => {
    if (!artifact.contentHash) return;
    setBusyKey(`verify:${artifact.id}`);
    setNotice(null);
    try {
      await apiFetch(`exports/${artifact.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          expectedContentHash: artifact.contentHash,
          ...checklist,
        }),
      });
      setVerificationArtifact(null);
      setNotice({
        tone: "success",
        title: "Revisión visual registrada",
        message:
          "El archivo quedó habilitado para registrar su envío. La persona, fecha, huella y lista de comprobación quedaron auditadas.",
      });
      await load(true);
    } catch (error) {
      setNotice({
        tone: "error",
        title: "No pudimos registrar la revisión",
        message: messageFrom(error),
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
              <FileDown className="size-3.5" />
              Automatización de notas
            </div>
            <h1 className="text-xl font-semibold sm:text-2xl">Exportaciones</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Genera entregables únicamente desde versiones aprobadas. Cada
              descarga conserva formato, versión, autoría y fuentes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-xl">
          <Metric value={stats.ready} label="Listas" tone="success" />
          <Metric value={stats.processing} label="En proceso" tone="primary" />
          <Metric value={stats.failed} label="Con alerta" tone="danger" />
        </div>
      </section>

      {notice ? (
        <Alert
          variant={notice.tone === "error" ? "destructive" : "default"}
          className={
            notice.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : undefined
          }
        >
          {notice.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-xl border bg-card p-3 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Buscar una nota aprobada o cliente…"
            aria-label="Buscar notas para exportar"
          />
        </div>
      </section>

      {loading ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : eligibleNotes.length ? (
        <section aria-labelledby="approved-notes-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="approved-notes-heading"
                className="text-base font-semibold"
              >
                Notas aprobadas
              </h2>
              <p className="text-xs text-muted-foreground">
                Selecciona uno o varios formatos por versión.
              </p>
            </div>
            <Badge variant="outline">
              {eligibleNotes.length}{" "}
              {eligibleNotes.length === 1 ? "nota" : "notas"}
            </Badge>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {eligibleNotes.map((note) => {
              const title = note.versions[0]?.title ?? "Nota sin título";
              return (
                <Card key={note.id} className="shadow-card">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <NoteStatusBadge status={note.status} />
                      <Badge variant="outline">v{note.currentVersion}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {note.client.name}
                      </span>
                    </div>
                    <CardTitle className="mt-2 text-sm leading-5">
                      {title}
                    </CardTitle>
                    <CardDescription>
                      {note.versions[0]?.wordCount ?? 0} palabras ·{" "}
                      {note.versions[0]?._count.sources ?? 0} fuentes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-3">
                    {formats.map((format) => {
                      const artifact = artifacts.find(
                        (item) =>
                          item.noteId === note.id &&
                          item.version === note.currentVersion &&
                          item.format === format.value,
                      );
                      const key = `${note.id}:${format.value}`;
                      return (
                        <FormatAction
                          key={format.value}
                          format={format}
                          artifact={artifact}
                          busy={busyKey === key}
                          onRequest={() =>
                            void requestExport(note, format.value)
                          }
                          onDownload={() =>
                            artifact ? void download(artifact) : undefined
                          }
                          downloading={
                            artifact
                              ? busyKey === `download:${artifact.id}`
                              : false
                          }
                        />
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : (
        <Card>
          <CardContent className="grid min-h-52 place-items-center p-6 text-center">
            <div>
              <ShieldCheck className="mx-auto size-7 text-primary" />
              <p className="mt-3 text-sm font-semibold">
                No hay notas aprobadas disponibles
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Las versiones aparecerán aquí después de superar QA y recibir
                aprobación humana.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="history-heading" className="space-y-3">
        <div>
          <h2 id="history-heading" className="text-base font-semibold">
            Historial de archivos
          </h2>
          <p className="text-xs text-muted-foreground">
            Estado técnico, integridad y descarga de cada entregable.
          </p>
        </div>
        {artifacts.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                busy={busyKey === `download:${artifact.id}`}
                onDownload={() => void download(artifact)}
                onDispatch={() => setDeliveryArtifact(artifact)}
                onVerify={() => setVerificationArtifact(artifact)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="grid min-h-40 place-items-center text-center">
              <div>
                <FileDown className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">
                  Todavía no hay archivos
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Genera el primer entregable desde una nota aprobada.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {deliveryArtifact ? (
        <ExportDispatchDialog
          artifact={deliveryArtifact}
          onClose={() => setDeliveryArtifact(null)}
          onSaved={() => void load(true)}
        />
      ) : null}
      {verificationArtifact ? (
        <ExportVerificationDialog
          artifact={verificationArtifact}
          busy={busyKey === `verify:${verificationArtifact.id}`}
          onClose={() => setVerificationArtifact(null)}
          onConfirm={(checklist) =>
            void verify(verificationArtifact, checklist)
          }
        />
      ) : null}
    </div>
  );
}

function FormatAction({
  format,
  artifact,
  busy,
  downloading,
  onRequest,
  onDownload,
}: {
  format: (typeof formats)[number];
  artifact?: ExportArtifactSummary;
  busy: boolean;
  downloading: boolean;
  onRequest: () => void;
  onDownload: () => void;
}) {
  const Icon = format.icon;
  const processing =
    artifact && ["QUEUED", "GENERATING"].includes(artifact.status);
  const ready = artifact?.status === "READY";
  return (
    <div className="rounded-xl border bg-background/45 p-3">
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{format.label}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            {format.description}
          </p>
        </div>
      </div>
      {ready ? (
        <Button
          className="mt-3 w-full"
          size="sm"
          variant="outline"
          onClick={onDownload}
          disabled={downloading}
        >
          {downloading ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Download />
          )}
          Descargar
        </Button>
      ) : (
        <Button
          className="mt-3 w-full"
          size="sm"
          variant="outline"
          onClick={onRequest}
          disabled={busy || Boolean(processing)}
        >
          {busy || processing ? (
            <LoaderCircle className="animate-spin" />
          ) : artifact && ["FAILED", "INVALID"].includes(artifact.status) ? (
            <RefreshCw />
          ) : (
            <FileDown />
          )}
          {processing
            ? "Procesando"
            : artifact && ["FAILED", "INVALID"].includes(artifact.status)
              ? "Regenerar"
              : "Generar"}
        </Button>
      )}
    </div>
  );
}

function ArtifactCard({
  artifact,
  busy,
  onDownload,
  onDispatch,
  onVerify,
}: {
  artifact: ExportArtifactSummary;
  busy: boolean;
  onDownload: () => void;
  onDispatch: () => void;
  onVerify: () => void;
}) {
  const status = exportStatus(artifact.status);
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{artifact.format}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
              {artifact.sentAt ? (
                <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                  <MailCheck />
                  Enviado
                </Badge>
              ) : null}
              {artifact.verifiedAt ? (
                <Badge className="bg-sky-50 text-sky-800 hover:bg-sky-50">
                  <ShieldCheck />
                  Revisado
                </Badge>
              ) : artifact.status === "READY" ? (
                <Badge variant="outline">Revisión visual pendiente</Badge>
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                v{artifact.version} · {artifact.note.client.name}
              </span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-sm font-semibold">
              {artifact.note.versions[0]?.title ??
                artifact.fileName ??
                "Nota exportada"}
            </h3>
            {artifact.fileName ? (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {artifact.fileName}
              </p>
            ) : null}
            {artifact.sentAt ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entregado a {artifact.sentToEmail} por {artifact.sentByEmail}
              </p>
            ) : null}
          </div>
          {artifact.status === "READY" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={artifact.verifiedAt ? onDispatch : onVerify}
              >
                <MailCheck />
                {artifact.verifiedAt
                  ? artifact.sentAt
                    ? "Actualizar envío"
                    : "Registrar envío"
                  : "Revisar entrega"}
              </Button>
              <Button size="sm" onClick={onDownload} disabled={busy}>
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download />
                )}
                Descargar
              </Button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniMetric
            value={artifact.sizeBytes ? formatBytes(artifact.sizeBytes) : "—"}
            label="Tamaño"
          />
          <MiniMetric
            value={artifact.contentHash?.slice(0, 10) ?? "—"}
            label="Huella"
          />
          <MiniMetric
            value={new Intl.DateTimeFormat("es-PE", {
              dateStyle: "short",
            }).format(new Date(artifact.updatedAt))}
            label="Actualizado"
          />
        </div>
        {artifact.errorMessage ? (
          <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            {artifact.errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExportVerificationDialog({
  artifact,
  busy,
  onClose,
  onConfirm,
}: {
  artifact: ExportArtifactSummary;
  busy: boolean;
  onClose: () => void;
  onConfirm: (checklist: {
    visualCheckConfirmed: boolean;
    contentParityConfirmed: boolean;
    linksAndMetadataConfirmed: boolean;
    notes: string;
  }) => void;
}) {
  const [visual, setVisual] = useState(false);
  const [parity, setParity] = useState(false);
  const [links, setLinks] = useState(false);
  const [notes, setNotes] = useState("");
  const complete = visual && parity && links;
  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : null)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Revisar entrega {artifact.format}</DialogTitle>
          <DialogDescription>
            Descarga y abre el archivo antes de confirmar. I HERE volverá a
            validar tamaño y huella, y registrará tu revisión visual sin
            reemplazar la versión aprobada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <VerificationCheck
            checked={visual}
            onChange={setVisual}
            label="El archivo abre correctamente y su diseño es legible."
          />
          <VerificationCheck
            checked={parity}
            onChange={setParity}
            label="El título, encabezados, contenido y fuentes coinciden con la versión aprobada."
          />
          <VerificationCheck
            checked={links}
            onChange={setLinks}
            label="Revisé metadatos, CTA y enlaces incluidos en el entregable."
          />
          <label className="block text-sm font-medium">
            Nota de revisión <span className="font-normal text-muted-foreground">(opcional)</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              autoComplete="off"
              className="mt-2 min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Registra un detalle útil si corresponde."
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                visualCheckConfirmed: visual,
                contentParityConfirmed: parity,
                linksAndMetadataConfirmed: links,
                notes,
              })
            }
            disabled={!complete || busy}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
            Confirmar revisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerificationCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-5 hover:bg-muted/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        autoComplete="off"
        className="mt-0.5 size-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "primary" | "danger";
}) {
  const colors =
    tone === "success"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "danger"
        ? "bg-rose-50 text-rose-800"
        : "bg-secondary text-primary";
  return (
    <div className={`rounded-xl p-3 text-center ${colors}`}>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[10px] font-medium">{label}</p>
    </div>
  );
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="truncate text-xs font-semibold">{value}</p>
      <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function exportStatus(status: ExportArtifactSummary["status"]): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (status === "READY") return { label: "Lista", variant: "default" };
  if (status === "FAILED" || status === "INVALID")
    return {
      label: status === "FAILED" ? "Falló" : "Inválida",
      variant: "destructive",
    };
  return {
    label: status === "QUEUED" ? "En cola" : "Generando",
    variant: "secondary",
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
