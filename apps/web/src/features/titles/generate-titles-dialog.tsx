"use client";

import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Circle,
  ListChecks,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { ActivityOrb, type OrbState } from "@/components/brand/activity-orb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCampaignMonth } from "@/lib/date/campaign-month";
import type {
  TitleGenerationInput,
  TitleBriefSuggestion,
  TitleGenerationProgress,
  TitleGenerationSummary,
  TitleSearchIntent,
} from "./ai-generation-api";

type Props = {
  open: boolean;
  clientName: string;
  onOpenChange: (open: boolean) => void;
  onSuggest: (
    campaignYear: number,
    campaignMonth: number,
    searchIntent: TitleSearchIntent,
  ) => Promise<TitleBriefSuggestion>;
  onGenerate: (
    input: TitleGenerationInput,
    onProgress: (progress: TitleGenerationProgress) => void,
  ) => Promise<TitleGenerationSummary>;
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const stages = [
  {
    title: "Estrategia SEO y GEO",
    description: "Analiza intención, historial y oportunidad.",
  },
  {
    title: "Revisión editorial",
    description: "Contrasta tono, utilidad y reglas autorizadas.",
  },
  {
    title: "Selección y control",
    description: "Elige alternativas y activa el QA auditable.",
  },
] as const;

const searchIntents: Array<{
  value: TitleSearchIntent;
  description: string;
}> = [
  {
    value: "Aprender",
    description: "Explicar un tema y ayudar a comprenderlo.",
  },
  {
    value: "Comparar",
    description: "Contrastar alternativas, criterios o escenarios.",
  },
  {
    value: "Decidir",
    description: "Orientar una elección empresarial informada.",
  },
  {
    value: "Contratar",
    description: "Evaluar una solución antes de solicitarla.",
  },
  {
    value: "Resolver",
    description: "Responder un problema concreto con acciones útiles.",
  },
];

export function GenerateTitlesDialog({
  open,
  clientName,
  onOpenChange,
  onSuggest,
  onGenerate,
}: Props) {
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [intent, setIntent] = useState<TitleSearchIntent | "">("");
  const [count, setCount] = useState(5);
  const [additionalContext, setAdditionalContext] = useState("");
  const [differentiation, setDifferentiation] = useState("");
  const [campaignYear, setCampaignYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [campaignMonth, setCampaignMonth] = useState(
    () => new Date().getMonth() + 1,
  );
  const [suggesting, setSuggesting] = useState(false);
  const [briefReady, setBriefReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<TitleGenerationProgress | null>(
    null,
  );
  const [result, setResult] = useState<TitleGenerationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    if (!intent) return;
    setSuggesting(true);
    setError(null);
    try {
      const suggestion = await onSuggest(campaignYear, campaignMonth, intent);
      setTopic(suggestion.topic);
      setObjective(suggestion.objective);
      setAudience(suggestion.audience);
      setAdditionalContext(suggestion.additionalContext);
      setDifferentiation(suggestion.differentiation);
      setBriefReady(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos preparar un encargo nuevo.",
      );
    } finally {
      setSuggesting(false);
    }
  };

  const resetRequest = () => {
    setTopic("");
    setObjective("");
    setAudience("");
    setIntent("");
    setCount(5);
    setAdditionalContext("");
    setDifferentiation("");
    setBriefReady(false);
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const requestOpenChange = (next: boolean) => {
    if (generating) return;
    if (!next) {
      resetRequest();
    }
    onOpenChange(next);
  };

  const generate = async () => {
    if (!intent) return;
    setGenerating(true);
    setResult(null);
    setError(null);
    setProgress({ status: "QUEUED", completedStages: 0 });
    try {
      const summary = await onGenerate(
        {
          topic: topic.trim(),
          objective: objective.trim(),
          audience: audience.trim(),
          searchIntent: intent,
          campaignYear,
          campaignMonth,
          count,
          additionalContext:
            [
              additionalContext.trim(),
              differentiation.trim()
                ? `Diferenciación requerida: ${differentiation.trim()}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n") || undefined,
        },
        setProgress,
      );
      setResult(summary);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos generar las propuestas.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate =
    Boolean(intent) &&
    topic.trim().length >= 3 &&
    objective.trim().length >= 10 &&
    audience.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            Generar propuestas de títulos
          </DialogTitle>
          <DialogDescription>
            Define el encargo para {clientName}. El sistema consultará el
            historial, debatirá las alternativas y las dejará pendientes de
            decisión humana.
          </DialogDescription>
        </DialogHeader>

        {generating ? (
          <GenerationProgress progress={progress} />
        ) : result ? (
          <GenerationSuccess
            result={result}
            onClose={() => requestOpenChange(false)}
          />
        ) : suggesting ? (
          <BriefSuggestionProgress
            campaignYear={campaignYear}
            campaignMonth={campaignMonth}
            intent={intent}
          />
        ) : !briefReady ? (
          <>
            <Alert className="border-primary/15 bg-secondary/45">
              <ListChecks />
              <AlertTitle>Primero define qué necesita el lector</AlertTitle>
              <AlertDescription>
                Tú eliges el periodo, la intención y la cantidad. Recién después
                contrastaremos el historial y prepararemos una sugerencia
                editable.
              </AlertDescription>
            </Alert>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No pudimos preparar la sugerencia</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-month">Mes del expediente</Label>
                <select
                  id="campaign-month"
                  value={campaignMonth}
                  onChange={(event) =>
                    setCampaignMonth(Number(event.target.value))
                  }
                  className={selectClass}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {formatCampaignMonth(2026, index + 1, false)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-year">Año</Label>
                <select
                  id="campaign-year"
                  value={campaignYear}
                  onChange={(event) =>
                    setCampaignYear(Number(event.target.value))
                  }
                  className={selectClass}
                >
                  {[campaignYear - 1, campaignYear, campaignYear + 1].map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm font-medium">
                  ¿Cuál es la intención principal de estos contenidos?
                </legend>
                <p className="text-xs leading-5 text-muted-foreground">
                  Esta elección será obligatoria y no podrá ser sustituida por
                  la sugerencia.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {searchIntents.map((item) => {
                    const selected = intent === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setIntent(item.value)}
                        className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/8 shadow-sm" : "bg-card hover:border-primary/35 hover:bg-secondary/35"}`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span
                            className={`grid size-5 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                          >
                            {selected ? <Check className="size-3" /> : null}
                          </span>
                          {item.value}
                        </span>
                        <span className="mt-1 block pl-7 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="count">Cantidad de alternativas</Label>
                <select
                  id="count"
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className={selectClass}
                >
                  <option value={4}>4 propuestas</option>
                  <option value={5}>5 propuestas</option>
                  <option value={8}>8 propuestas</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => requestOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button onClick={() => void suggest()} disabled={!intent}>
                <Sparkles />
                Preparar sugerencia
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Alert className="border-primary/15 bg-secondary/45">
              <Sparkles />
              <AlertTitle>Encargo sugerido y completamente editable</AlertTitle>
              <AlertDescription>
                Revisa cada campo. La intención fue elegida por ti y la
                sugerencia ya fue contrastada con el historial del cliente.
              </AlertDescription>
            </Alert>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se completó la generación</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/35 p-3 text-xs">
              <Badge variant="outline" className="bg-card">
                <CalendarDays />
                {formatCampaignMonth(campaignYear, campaignMonth)}
              </Badge>
              <Badge variant="outline" className="bg-card">
                Intención: {intent}
              </Badge>
              <Badge variant="outline" className="bg-card">
                {count} propuestas
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setBriefReady(false);
                  setTopic("");
                  setObjective("");
                  setAudience("");
                  setAdditionalContext("");
                  setDifferentiation("");
                  setError(null);
                }}
              >
                <ArrowLeft />
                Cambiar criterios
              </Button>
            </div>
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="topic">Tema principal</Label>
                <Input
                  id="topic"
                  maxLength={200}
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Ej. contratación temporal para campañas estacionales"
                  autoFocus
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="objective">Objetivo editorial</Label>
                <Textarea
                  id="objective"
                  maxLength={600}
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  className="min-h-20"
                  placeholder="¿Qué debe comprender, comparar o decidir el lector después de leer la nota?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Público</Label>
                <Input
                  id="audience"
                  maxLength={300}
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="Ej. gerencias de Recursos Humanos y Operaciones"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="additional-context">
                  Contexto y límites editoriales
                </Label>
                <Textarea
                  id="additional-context"
                  maxLength={950}
                  value={additionalContext}
                  onChange={(event) => setAdditionalContext(event.target.value)}
                  className="min-h-32"
                  placeholder="Campaña, servicio, enfoque que debe priorizarse o temas que conviene evitar."
                />
                <p className="text-right text-xs text-muted-foreground">
                  {additionalContext.length}/950
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="differentiation">
                  Diferenciación requerida
                </Label>
                <Textarea
                  id="differentiation"
                  maxLength={450}
                  value={differentiation}
                  onChange={(event) => setDifferentiation(event.target.value)}
                  className="min-h-24"
                  placeholder="¿Qué hará que esta propuesta no sea una repetición del historial?"
                />
                <p className="text-right text-xs text-muted-foreground">
                  {differentiation.length}/450
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => void suggest()}>
                <RefreshCw />
                Sugerir otro encargo
              </Button>
              <Button
                variant="outline"
                onClick={() => requestOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button onClick={() => void generate()} disabled={!canGenerate}>
                <Sparkles />
                Generar {count} propuestas
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BriefSuggestionProgress({
  campaignYear,
  campaignMonth,
  intent,
}: {
  campaignYear: number;
  campaignMonth: number;
  intent: TitleSearchIntent | "";
}) {
  return (
    <div
      className="min-h-96 py-4"
      role="status"
      aria-live="polite"
      aria-label="Preparando sugerencia editorial"
    >
      <div className="rounded-2xl border bg-gradient-to-br from-secondary/75 via-card to-card p-6 text-center sm:p-8">
        <div className="mx-auto w-fit">
          <ActivityOrb state="working" />
        </div>
        <h3 className="mt-5 text-lg font-bold">
          Estamos preparando tu sugerencia
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Puede tomar unos momentos. No cierres la ventana ni vuelvas a
          presionar el botón: el proceso sigue activo.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Badge variant="outline" className="bg-card/85">
            {formatCampaignMonth(campaignYear, campaignMonth)}
          </Badge>
          <Badge variant="outline" className="bg-card/85">
            Intención: {intent}
          </Badge>
        </div>
        <ol className="mx-auto mt-7 grid max-w-lg gap-3 text-left">
          {[
            "Leyendo títulos, reglas y correcciones anteriores",
            "Descartando temas e intenciones repetidas",
            "Completando un encargo editable y sin frases cortadas",
          ].map((label, index) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border bg-card/85 p-3"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="text-sm font-medium">{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function GenerationProgress({
  progress,
}: {
  progress: TitleGenerationProgress | null;
}) {
  const completed = progress?.completedStages ?? 0;
  const orbState: OrbState =
    completed === 0 ? "working" : completed < 3 ? "solving" : "shaping";
  const statusText =
    progress?.status === "QUEUED"
      ? "Reservando una ejecución segura"
      : completed === 0
        ? "Analizando el encargo y el historial"
        : completed < 3
          ? "Contrastando las propuestas"
          : "Guardando propuestas y ejecutando controles";

  return (
    <div className="min-h-80 py-5" aria-live="polite">
      <div className="rounded-xl border bg-gradient-to-br from-secondary/70 via-card to-card p-5 sm:p-6">
        <ActivityOrb state={orbState} />
        <h3 className="mt-4 text-base font-semibold">{statusText}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Puedes dejar esta ventana abierta; no es necesario recargar la página.
        </p>
        <ol className="mt-6 space-y-3">
          {stages.map((stage, index) => {
            const done = completed > index;
            const active =
              !done && completed === index && progress?.status === "RUNNING";
            return (
              <li
                key={stage.title}
                className="flex items-start gap-3 rounded-lg border bg-card/80 p-3"
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
                  <p className="text-sm font-semibold">{stage.title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {stage.description}
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

function GenerationSuccess({
  result,
  onClose,
}: {
  result: TitleGenerationSummary;
  onClose: () => void;
}) {
  return (
    <div className="py-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
        <span className="grid size-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">
          {result.proposalCount} propuestas listas para revisar
        </h3>
        <p className="mt-1 text-sm leading-6">
          Se creó un paquete nuevo con título, objetivo, público, intención,
          enfoque, oportunidad y riesgo. Al cerrar podrás abrir cada propuesta,
          editar cualquiera de esos datos y volver a evaluarla. Ninguna fue
          aprobada automáticamente.
        </p>
      </div>
      <DialogFooter className="mt-5">
        <Button onClick={onClose}>Ver propuestas</Button>
      </DialogFooter>
    </div>
  );
}
