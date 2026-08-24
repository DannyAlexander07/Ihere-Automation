"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError } from "@/lib/api/api-client";

type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

type PackageTitle = {
  proposalId: string;
  version: number;
  content: {
    title: string;
    objective: string;
    audience: string;
    searchIntent: string;
    focus: string;
    opportunity: string | null;
    risk: string | null;
  };
};

export type PublicTitlePackageReview = {
  client: { name: string; slug: string };
  generationRunId: string;
  topic: string;
  createdAt: string;
  expiresAt: string;
  recipientName: string;
  recipientEmailHint: string | null;
  approvalTarget: number;
  titles: PackageTitle[];
};

type ItemDecision = { type: Decision | null; reason: string };
type CompletedSummary = Record<Decision, number> & { NOT_SELECTED: number };

const approvalReason = "Aprobado por el cliente.";

const decisionState = {
  APPROVE: {
    label: "Aprobado",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    card: "border-emerald-200",
  },
  REQUEST_CHANGES: {
    label: "Observado",
    icon: MessageSquareText,
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    card: "border-amber-200",
  },
  REJECT: {
    label: "Rechazado",
    icon: CircleX,
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    card: "border-rose-200",
  },
} as const;

const decisionOptions: Array<{
  value: Decision;
  label: string;
  icon: typeof CheckCircle2;
  tone: string;
}> = [
  {
    value: "APPROVE",
    label: "Aprobar",
    icon: CheckCircle2,
    tone: "data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-800",
  },
  {
    value: "REQUEST_CHANGES",
    label: "Observar",
    icon: MessageSquareText,
    tone: "data-[active=true]:border-amber-500 data-[active=true]:bg-amber-50 data-[active=true]:text-amber-900",
  },
  {
    value: "REJECT",
    label: "Rechazar",
    icon: CircleX,
    tone: "data-[active=true]:border-rose-500 data-[active=true]:bg-rose-50 data-[active=true]:text-rose-800",
  },
];

export function TitlePackageReviewPortal({
  token,
  initialData,
  unavailable,
}: {
  token: string;
  initialData: PublicTitlePackageReview | null;
  unavailable: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() =>
    Object.fromEntries(
      (initialData?.titles ?? []).map((title) => [
        title.proposalId,
        { type: null, reason: "" },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedSummary | null>(null);

  const summary = useMemo(() => {
    const values = Object.values(decisions);
    return {
      APPROVE: values.filter((item) => item.type === "APPROVE").length,
      REQUEST_CHANGES: values.filter((item) => item.type === "REQUEST_CHANGES")
        .length,
      REJECT: values.filter((item) => item.type === "REJECT").length,
      PENDING: values.filter((item) => item.type === null).length,
    };
  }, [decisions]);

  const reviewedCount = initialData
    ? initialData.titles.length - summary.PENDING
    : 0;
  const approvalTarget = initialData?.approvalTarget ?? 0;
  const targetReached = summary.APPROVE === approvalTarget;
  const allReviewed = initialData
    ? reviewedCount === initialData.titles.length
    : false;
  const canSubmit = targetReached || allReviewed;

  if (unavailable || !initialData) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
        <Card className="w-full max-w-lg text-center shadow-soft">
          <CardContent className="p-8">
            <AlertTriangle className="mx-auto size-9 text-amber-600" />
            <h1 className="mt-4 text-xl font-semibold">Enlace no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace venció, ya fue respondido o alguno de los títulos fue
              actualizado. Solicita un paquete nuevo al equipo de Mood.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const updateReason = (proposalId: string, reason: string) => {
    setDecisions((current) => ({
      ...current,
      [proposalId]: {
        ...current[proposalId],
        reason,
      },
    }));
    setError(null);
  };

  const toggleDecision = (proposalId: string, type: Decision) => {
    setDecisions((current) => {
      const currentDecision = current[proposalId];
      const isSelected = currentDecision.type === type;
      const approvedCount = Object.values(current).filter(
        (decision) => decision.type === "APPROVE",
      ).length;

      if (
        type === "APPROVE" &&
        !isSelected &&
        approvedCount >= approvalTarget
      ) {
        setError(
          `Ya aprobaste los ${approvalTarget} títulos necesarios para este paquete.`,
        );
        return current;
      }

      return {
        ...current,
        [proposalId]: {
          type: isSelected ? null : type,
          reason: type === "APPROVE" ? "" : currentDecision.reason,
        },
      };
    });
    setError(null);
  };

  const submit = async () => {
    const incompleteReason = initialData.titles.some((title) => {
      const item = decisions[title.proposalId];
      return (
        item?.type !== null &&
        item?.type !== "APPROVE" &&
        item.reason.trim().length < 5
      );
    });
    if (!canSubmit) {
      setError(
        `Aprueba ${approvalTarget} títulos o registra una decisión para cada alternativa.`,
      );
      return;
    }
    if (!reviewerEmail.includes("@") || incompleteReason) {
      setError(
        "Completa el correo autorizado y explica cada observación o rechazo con al menos 5 caracteres.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest<{ notSelectedCount: number }>(
        "public/title-package-reviews/current/decision",
        {
          method: "POST",
          headers: { "x-review-token": token },
          body: JSON.stringify({
            reviewerEmail: reviewerEmail.trim(),
            decisions: initialData.titles.flatMap((title) => {
              const decision = decisions[title.proposalId];
              return decision.type
                ? [
                    {
                      proposalId: title.proposalId,
                      version: title.version,
                      type: decision.type,
                      reason:
                        decision.type === "APPROVE"
                          ? approvalReason
                          : decision.reason.trim(),
                    },
                  ]
                : [];
            }),
          }),
        },
      );
      setCompleted({
        APPROVE: summary.APPROVE,
        REQUEST_CHANGES: targetReached ? 0 : summary.REQUEST_CHANGES,
        REJECT: targetReached ? 0 : summary.REJECT,
        NOT_SELECTED: response.notSelectedCount,
      });
      window.sessionStorage.removeItem("ihere:title-package-review-token");
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "No pudimos registrar la revisión del paquete.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (completed) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-5">
        <Card className="w-full max-w-xl text-center shadow-soft">
          <CardContent className="p-8">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <h1 className="mt-4 text-xl font-semibold">
              Revisión del paquete registrada
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {completed.APPROVE} aprobados · {completed.REQUEST_CHANGES}{" "}
              observados · {completed.REJECT} rechazados
              {completed.NOT_SELECTED
                ? ` · ${completed.NOT_SELECTED} no seleccionados`
                : ""}
              . El equipo recibió el detalle de la revisión.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const activeTitle = initialData.titles[activeIndex];
  const activeDecision = decisions[activeTitle.proposalId];
  const activeState = activeDecision.type
    ? decisionState[activeDecision.type]
    : null;
  const ActiveStateIcon = activeState?.icon ?? Clock3;

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{initialData.client.name}</Badge>
                <Badge variant="outline">
                  <PackageCheck className="size-3" />{" "}
                  {initialData.titles.length} títulos
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold">
                Revisión de propuestas de títulos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Hola, {initialData.recipientName}. Revisa las alternativas del
                paquete “{initialData.topic}” y aprueba hasta {approvalTarget}{" "}
                títulos para desarrollar.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="size-4" /> Vence{" "}
              {new Date(initialData.expiresAt).toLocaleDateString("es-PE")}
            </div>
          </div>
        </header>

        <nav
          aria-label="Avance de revisión del paquete"
          className="rounded-2xl border bg-card p-4 shadow-card"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {summary.APPROVE} de {approvalTarget} títulos aprobados
            </p>
            <span className="text-xs text-muted-foreground">
              {targetReached
                ? "Ya puedes enviar la respuesta"
                : "También puedes observar o rechazar alternativas"}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Títulos aprobados"
            aria-valuemin={0}
            aria-valuemax={approvalTarget}
            aria-valuenow={summary.APPROVE}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${Math.min(100, (summary.APPROVE / approvalTarget) * 100)}%`,
              }}
            />
          </div>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Títulos del paquete"
          >
            {initialData.titles.map((title, index) => {
              const type = decisions[title.proposalId].type;
              const state = type ? decisionState[type] : null;
              const Icon = state?.icon ?? Clock3;
              const isActive = activeIndex === index;
              return (
                <button
                  key={title.proposalId}
                  type="button"
                  role="tab"
                  id={`tab-titulo-${index + 1}`}
                  aria-selected={isActive}
                  aria-controls="panel-titulo-activo"
                  onClick={() => setActiveIndex(index)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${isActive ? "border-primary ring-2 ring-primary/15" : "hover:-translate-y-0.5"} ${state?.badge ?? "bg-muted/40 text-muted-foreground"}`}
                >
                  <Icon className="size-3.5" /> Título {index + 1} ·{" "}
                  {state?.label ?? "Pendiente"}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card
            id="panel-titulo-activo"
            role="tabpanel"
            aria-labelledby={`tab-titulo-${activeIndex + 1}`}
            className={`h-fit shadow-card transition-colors ${activeState?.card ?? ""}`}
          >
            <CardHeader className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full ${activeState?.badge ?? "bg-secondary text-primary"}`}
                >
                  <ActiveStateIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      Título {activeIndex + 1} de {initialData.titles.length}
                    </Badge>
                    <Badge variant="outline">
                      Versión {activeTitle.version}
                    </Badge>
                    <Badge variant="outline" className={activeState?.badge}>
                      {activeState?.label ?? "Pendiente de revisión"}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3 text-xl font-bold leading-8 sm:text-2xl">
                    {activeTitle.content.title}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Objetivo", activeTitle.content.objective],
                  ["Público", activeTitle.content.audience],
                  ["Intención", activeTitle.content.searchIntent],
                  ["Enfoque", activeTitle.content.focus],
                  ["Oportunidad", activeTitle.content.opportunity],
                  ["Riesgo a evitar", activeTitle.content.risk],
                ].map(([label, value]) => (
                  <section
                    key={label}
                    className="rounded-2xl border bg-background/70 p-4 sm:p-5"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 text-[15px] font-medium leading-7">
                      {value || "Sin observación adicional."}
                    </p>
                  </section>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {decisionOptions.map(({ value, label, icon: Icon, tone }) => (
                  <button
                    key={value}
                    type="button"
                    data-active={activeDecision.type === value}
                    aria-pressed={activeDecision.type === value}
                    onClick={() =>
                      toggleDecision(activeTitle.proposalId, value)
                    }
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition hover:bg-muted/50 ${tone}`}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Para desmarcar una decisión, vuelve a presionar el mismo botón.
              </p>
              {activeDecision.type === "APPROVE" ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="size-4" /> Aprobado sin
                  observaciones.
                </div>
              ) : activeDecision.type ? (
                <div className="space-y-2">
                  <Label htmlFor={`reason-${activeTitle.proposalId}`}>
                    {activeDecision.type === "REJECT"
                      ? "Motivo del rechazo"
                      : "Detalle de la observación"}
                  </Label>
                  <Textarea
                    id={`reason-${activeTitle.proposalId}`}
                    aria-label={`Observación para título ${activeIndex + 1}`}
                    value={activeDecision.reason}
                    onChange={(event) =>
                      updateReason(activeTitle.proposalId, event.target.value)
                    }
                    placeholder="Indica con precisión qué debe ajustarse y por qué."
                    className="min-h-24"
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Selecciona aprobar, observar o rechazar para registrar la
                  revisión de este título.
                </p>
              )}
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveIndex((current) => current - 1)}
                  disabled={activeIndex === 0}
                >
                  <ChevronLeft /> Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  {activeIndex + 1} / {initialData.titles.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveIndex((current) => current + 1)}
                  disabled={activeIndex === initialData.titles.length - 1}
                >
                  Siguiente <ChevronRight />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit shadow-card lg:sticky lg:top-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" /> Cerrar revisión
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
                  <strong className="block text-lg">{summary.APPROVE}</strong>
                  Aprobados
                </div>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
                  <strong className="block text-lg">
                    {summary.REQUEST_CHANGES}
                  </strong>
                  Observados
                </div>
                <div className="rounded-lg bg-rose-50 p-2 text-rose-800">
                  <strong className="block text-lg">{summary.REJECT}</strong>
                  Rechazados
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Progreso</span>
                  <span>
                    {summary.APPROVE}/{approvalTarget} aprobados
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.min(100, (summary.APPROVE / approvalTarget) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-review-email">
                  Confirma tu correo corporativo
                </Label>
                <Input
                  id="package-review-email"
                  type="email"
                  inputMode="email"
                  spellCheck={false}
                  value={reviewerEmail}
                  onChange={(event) => setReviewerEmail(event.target.value)}
                  placeholder={
                    initialData.recipientEmailHint || "nombre@empresa.com"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Escribe el correo completo al que llegó este enlace. Lo usamos
                  para confirmar que responde la persona autorizada; la pista{" "}
                  {initialData.recipientEmailHint || "oculta"} nunca muestra el
                  correo completo públicamente.
                </p>
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo registrar</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={busy || !canSubmit}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                Enviar revisión completa
              </Button>
              {!canSubmit ? (
                <p className="text-center text-xs font-medium text-amber-700">
                  Faltan {approvalTarget - summary.APPROVE} por aprobar. Si no
                  deseas aprobarlas, revisa todas las alternativas para enviar
                  tus observaciones.
                </p>
              ) : targetReached && summary.PENDING ? (
                <p className="text-center text-xs font-medium text-emerald-700">
                  Las {summary.PENDING} alternativas restantes quedarán como no
                  seleccionadas.
                </p>
              ) : null}
              <p className="text-xs leading-5 text-muted-foreground">
                La respuesta se enviará como un solo paquete. Las alternativas
                que sobren no requerirán corrección cuando ya existan{" "}
                {approvalTarget} aprobadas.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
