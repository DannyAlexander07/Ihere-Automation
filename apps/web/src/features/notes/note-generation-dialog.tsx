"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, Sparkles } from "lucide-react";
import { ActivityOrb, type OrbState } from "@/components/brand/activity-orb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  TitleGenerationProgress,
  TitleGenerationSummary,
} from "@/features/titles/ai-generation-api";

const stages = [
  ["Investigación verificable", "Busca y conserva fuentes web citables."],
  ["Redacción editorial", "Construye el borrador SEO, GEO y AEO."],
  ["Auditoría y QA", "Corrige el contenido y activa la rúbrica de calidad."],
] as const;

export function NoteGenerationDialog({
  open,
  onOpenChange,
  onGenerate,
  revisionFeedback,
  autoStart = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (
    onProgress: (progress: TitleGenerationProgress) => void,
  ) => Promise<TitleGenerationSummary>;
  revisionFeedback?: string;
  autoStart?: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<TitleGenerationProgress | null>(
    null,
  );
  const [result, setResult] = useState<TitleGenerationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const requestOpenChange = (next: boolean) => {
    if (generating) return;
    if (!next) {
      setProgress(null);
      setResult(null);
      setError(null);
      startedRef.current = false;
    }
    onOpenChange(next);
  };

  const generate = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setGenerating(true);
    setError(null);
    setProgress({ status: "QUEUED", completedStages: 0 });
    try {
      setResult(await onGenerate(setProgress));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos generar el borrador.",
      );
      startedRef.current = false;
    } finally {
      setGenerating(false);
    }
  }, [onGenerate]);

  useEffect(() => {
    if (!open || !autoStart) return;
    const timer = window.setTimeout(() => void generate(), 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, generate, open]);

  const showingProgress = generating || (open && autoStart && !result && !error);

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {revisionFeedback
              ? "Preparar corrección de la nota"
              : "Generar borrador de la nota"}
          </DialogTitle>
          <DialogDescription>
            El brief aprobado queda bloqueado. La entrega se guardará como un
            borrador versionado y nunca se aprobará automáticamente.
          </DialogDescription>
        </DialogHeader>

        {showingProgress ? (
          <NoteProgress progress={progress} />
        ) : result ? (
          <div className="py-3">
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <Check />
              <AlertTitle>Borrador generado y enviado a QA</AlertTitle>
              <AlertDescription>
                El borrador, las fuentes y los controles quedaron
                registrados. Revisa el contenido antes de aprobarlo.
              </AlertDescription>
            </Alert>
            <DialogFooter className="mt-5">
              <Button onClick={() => requestOpenChange(false)}>
                Revisar borrador
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <Alert className="border-primary/15 bg-secondary/45">
              <Sparkles />
              <AlertTitle>Fuentes reales y trazabilidad</AlertTitle>
              <AlertDescription>
                La investigación conserva las URLs citadas; redacción y
                auditoría solo pueden usar esas fuentes. Después se ejecuta la
                rúbrica determinista.
              </AlertDescription>
            </Alert>
            {revisionFeedback ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertTitle>Observación que debe resolverse</AlertTitle>
                <AlertDescription>{revisionFeedback}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se completó la generación</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Alert className="border-emerald-200/80 bg-emerald-50/70 text-emerald-950">
              <Check />
              <AlertTitle>Brief completo y listo</AlertTitle>
              <AlertDescription>
                I HERE utilizará el título aprobado, el contexto del cliente,
                las reglas editoriales, las fuentes requeridas y las
                observaciones registradas. No necesitas volver a escribirlas.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => requestOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button onClick={() => void generate()}>
                <Sparkles />
                {revisionFeedback
                  ? "Preparar nueva versión"
                  : "Investigar y redactar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoteProgress({
  progress,
}: {
  progress: TitleGenerationProgress | null;
}) {
  const completed = progress?.completedStages ?? 0;
  const orbState: OrbState =
    completed === 0 ? "searching" : completed === 1 ? "composing" : "solving";
  return (
    <div className="min-h-80 py-4" aria-live="polite">
      <div className="rounded-xl border bg-gradient-to-br from-secondary/70 via-card to-card p-5">
        <ActivityOrb state={orbState} />
        <p className="mt-4 text-sm font-semibold">
          {progress?.status === "QUEUED"
            ? "Preparando la ejecución segura"
            : completed === 0
              ? "Investigando fuentes"
              : completed === 1
                ? "Redactando el borrador"
                : "Auditando y guardando la versión"}
        </p>
        <ol className="mt-5 space-y-3">
          {stages.map(([title, description], index) => {
            const done = completed > index;
            const active =
              progress?.status === "RUNNING" && completed === index;
            return (
              <li
                key={title}
                className="flex gap-3 rounded-lg border bg-card/80 p-3"
              >
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Circle
                      className={`size-3 ${active ? "fill-current" : ""}`}
                    />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
