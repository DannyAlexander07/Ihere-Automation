"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleX,
  Clock3,
  GitCompareArrows,
  History,
  MessageSquareText,
  PencilLine,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  canApproveTitle,
  correctionTypeLabels,
  getTitleBlockingReasons,
} from "./rules";
import { DuplicateBadge, TitleStatusBadge } from "./title-status-badge";
import type {
  TitleCandidate,
  TitleCorrectionType,
  TitleEditorialDraft,
} from "./types";

type DetailTab = "summary" | "debate" | "history";

type Props = {
  candidate: TitleCandidate | null;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (
    id: string,
    action: "approve" | "changes" | "reject",
    reason: string,
  ) => void;
  onEdit: (
    id: string,
    draft: TitleEditorialDraft,
    type: TitleCorrectionType,
    reason: string,
    confirmedPermanent: boolean,
  ) => void;
  onResolveDuplicate: (
    id: string,
    recommendation: TitleCandidate["duplicate"]["recommendation"],
    reason: string,
  ) => void;
  onShare: (candidate: TitleCandidate) => void;
  permissions: {
    canEditAndEvaluate: boolean;
    canReview: boolean;
    canShare: boolean;
  };
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const automaticEditorialChangeReason =
  "Corrección editorial realizada durante la revisión interna.";

export function TitleDetailSheet(props: Props) {
  const { candidate, onDecision, onEdit, onResolveDuplicate, onShare } = props;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[500px]"
        showCloseButton
      >
        {candidate && (
          <TitleDetailBody
            key={`${candidate.id}:${candidate.currentVersion ?? "local"}`}
            candidate={candidate}
            onDecision={onDecision}
            onEdit={onEdit}
            onResolveDuplicate={onResolveDuplicate}
            onShare={onShare}
            permissions={props.permissions}
            busy={props.busy}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TitleDetailBody({
  candidate,
  onDecision,
  onEdit,
  onResolveDuplicate,
  onShare,
  permissions,
  busy = false,
}: Omit<Props, "candidate" | "open" | "onOpenChange"> & {
  candidate: TitleCandidate;
}) {
  const [tab, setTab] = useState<DetailTab>("summary");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TitleEditorialDraft>({
    title: candidate.title,
    objective: candidate.objective,
    audience: candidate.audience,
    searchIntent: candidate.intent,
    focus: candidate.focus,
    opportunity: candidate.opportunity,
    risk: candidate.risk,
  });
  const [correctionType, setCorrectionType] =
    useState<TitleCorrectionType>("one_off");
  const [reason, setReason] = useState("");
  const [confirmedPermanent, setConfirmedPermanent] = useState(false);
  const [duplicateDecision, setDuplicateDecision] = useState(
    candidate.duplicate.recommendation,
  );
  const [decisionReason, setDecisionReason] = useState("");
  const blockers = getTitleBlockingReasons(candidate);
  const approvalAllowed = canApproveTitle(candidate);
  const terminal = ["approved", "rejected", "used", "archived"].includes(
    candidate.status,
  );
  const editable = ["draft", "proposed", "changes_requested"].includes(
    candidate.status,
  );
  const hasEditorialChanges =
    draft.title.trim() !== candidate.title.trim() ||
    draft.objective.trim() !== candidate.objective.trim() ||
    draft.audience.trim() !== candidate.audience.trim() ||
    draft.searchIntent.trim() !== candidate.intent.trim() ||
    draft.focus.trim() !== candidate.focus.trim() ||
    draft.opportunity.trim() !== candidate.opportunity.trim() ||
    draft.risk.trim() !== candidate.risk.trim();
  const validEditorialDraft =
    draft.title.trim().length >= 10 &&
    draft.objective.trim().length >= 10 &&
    draft.audience.trim().length >= 3 &&
    draft.searchIntent.trim().length >= 3 &&
    draft.focus.trim().length >= 3;
  const needsDetailedReason = correctionType !== "one_off";
  const validCorrectionContext =
    (!needsDetailedReason || reason.trim().length >= 5) &&
    (correctionType !== "permanent_preference" || confirmedPermanent);

  const saveEdit = () => {
    const changeReason =
      reason.trim() || automaticEditorialChangeReason;
    onEdit(
      candidate.id,
      {
        title: draft.title.trim(),
        objective: draft.objective.trim(),
        audience: draft.audience.trim(),
        searchIntent: draft.searchIntent.trim(),
        focus: draft.focus.trim(),
        opportunity: draft.opportunity.trim(),
        risk: draft.risk.trim(),
      },
      correctionType,
      changeReason,
      confirmedPermanent,
    );
    setEditing(false);
  };

  return (
    <>
      <SheetHeader className="border-b px-6 py-5 pr-16">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TitleStatusBadge status={candidate.status} />
          <DuplicateBadge
            level={candidate.duplicate.level}
            score={candidate.duplicate.score}
          />
          <Badge variant="outline">
            {candidate.evaluationStatus === "COMPLETED" || !candidate.persisted
              ? `${candidate.score}/100`
              : "Puntaje pendiente"}
          </Badge>
        </div>
        <SheetTitle className="text-lg font-extrabold leading-6">
          {candidate.title}
        </SheetTitle>
        <SheetDescription>
          {candidate.client} · {candidate.campaign} · Responsable:{" "}
          {candidate.owner}
        </SheetDescription>
      </SheetHeader>

      <div
        className="flex border-b px-6"
        role="tablist"
        aria-label="Detalle de la propuesta"
      >
        {(
          [
            ["summary", "Resumen", Sparkles],
            ["debate", "Evaluación", Bot],
            ["history", "Historial", History],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3.5 py-3.5 text-xs font-semibold",
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-6">
          {tab === "summary" && (
            <>
              {blockers.length > 0 && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertTriangle />
                  <AlertTitle>La aprobación está bloqueada</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold">Propuesta editorial</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing((value) => !value)}
                    disabled={
                      !editable || !permissions.canEditAndEvaluate || busy
                    }
                  >
                    <PencilLine />
                    {editing ? "Cancelar" : "Editar"}
                  </Button>
                </div>
                {editing ? (
                  <div className="mt-4 space-y-4 rounded-xl border bg-muted/35 p-5">
                    <div className="space-y-2">
                      <Label htmlFor={`title-${candidate.id}`}>Título</Label>
                      <Textarea
                        id={`title-${candidate.id}`}
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className="min-h-20 bg-card px-3.5 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`objective-${candidate.id}`}>
                        Objetivo editorial
                      </Label>
                      <Textarea
                        id={`objective-${candidate.id}`}
                        value={draft.objective}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            objective: event.target.value,
                          }))
                        }
                        className="min-h-20 bg-card px-3.5 py-3"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <EditField
                        id={`audience-${candidate.id}`}
                        label="Público"
                        value={draft.audience}
                        onChange={(audience) =>
                          setDraft((current) => ({ ...current, audience }))
                        }
                      />
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Intención</p>
                          <Badge variant="outline">Solo lectura</Badge>
                        </div>
                        <div className="min-h-20 rounded-lg border bg-muted/60 px-3.5 py-3">
                          <p className="text-sm font-semibold">
                            {draft.searchIntent}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Se conserva la intención definida al preparar el
                            título.
                          </p>
                        </div>
                      </div>
                      <EditField
                        id={`focus-${candidate.id}`}
                        label="Enfoque"
                        value={draft.focus}
                        onChange={(focus) =>
                          setDraft((current) => ({ ...current, focus }))
                        }
                      />
                      <EditField
                        id={`opportunity-${candidate.id}`}
                        label="Oportunidad"
                        value={draft.opportunity}
                        onChange={(opportunity) =>
                          setDraft((current) => ({ ...current, opportunity }))
                        }
                      />
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`risk-${candidate.id}`}>
                          Riesgo a evitar
                        </Label>
                        <Textarea
                          id={`risk-${candidate.id}`}
                          value={draft.risk}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              risk: event.target.value,
                            }))
                          }
                          className="min-h-20 bg-card px-3.5 py-3"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`type-${candidate.id}`}>
                          Tipo de corrección
                        </Label>
                        <select
                          id={`type-${candidate.id}`}
                          value={correctionType}
                          onChange={(event) =>
                            setCorrectionType(
                              event.target.value as TitleCorrectionType,
                            )
                          }
                          className={selectClass}
                        >
                          {Object.entries(correctionTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`reason-${candidate.id}`}>
                          Motivo {needsDetailedReason ? "" : "(opcional)"}
                        </Label>
                        <Textarea
                          id={`reason-${candidate.id}`}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Explica qué debe aprender el sistema"
                          className="min-h-20 bg-card px-3.5 py-3"
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          {needsDetailedReason
                            ? "Explica el criterio aplicado para conservar la trazabilidad."
                            : "Si lo dejas vacío, I HERE registrará que fue una corrección editorial interna."}
                        </p>
                      </div>
                    </div>
                    {correctionType === "permanent_preference" && (
                      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                        <input
                          type="checkbox"
                          checked={confirmedPermanent}
                          onChange={(event) =>
                            setConfirmedPermanent(event.target.checked)
                          }
                          className="mt-1"
                        />
                        Confirmo que esta preferencia puede proponerse como
                        regla permanente del cliente. Todavía deberá pasar por
                        autorización.
                      </label>
                    )}
                    <Button
                      onClick={saveEdit}
                      disabled={
                        busy ||
                        !permissions.canEditAndEvaluate ||
                        !hasEditorialChanges ||
                        !validEditorialDraft ||
                        !validCorrectionContext
                      }
                    >
                      <Save />
                      Guardar y reevaluar
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border bg-background/60 p-5">
                    <p className="font-heading text-base font-bold leading-6">
                      {candidate.title}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Intención", candidate.intent],
                  ["Público", candidate.audience],
                  ["Enfoque", candidate.focus],
                  ["Oportunidad", candidate.opportunity],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1.5 text-xs leading-5">{value}</p>
                  </div>
                ))}
              </section>

              <section className="rounded-xl border p-5">
                <div className="flex items-center gap-2">
                  <GitCompareArrows className="size-4 text-primary" />
                  <h2 className="text-sm font-bold">Análisis de duplicidad</h2>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Nota relacionada
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {candidate.duplicate.relatedTitle}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Publicada en {candidate.duplicate.relatedDate} ·
                  Recomendación: {candidate.duplicate.recommendation}
                </p>
                {!candidate.duplicate.resolved && permissions.canReview ? (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3">
                    <Label
                      htmlFor={`duplicate-${candidate.id}`}
                      className="text-xs text-amber-950"
                    >
                      Decisión humana
                    </Label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <select
                        id={`duplicate-${candidate.id}`}
                        value={duplicateDecision}
                        onChange={(event) =>
                          setDuplicateDecision(
                            event.target
                              .value as TitleCandidate["duplicate"]["recommendation"],
                          )
                        }
                        className={cn(selectClass, "bg-card")}
                      >
                        {(
                          [
                            "Crear",
                            "Complementar",
                            "Actualizar",
                            "Fusionar",
                            "Descartar",
                          ] as const
                        ).map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        className="bg-card"
                        disabled={busy || decisionReason.trim().length < 5}
                        onClick={() =>
                          onResolveDuplicate(
                            candidate.id,
                            duplicateDecision,
                            decisionReason.trim(),
                          )
                        }
                      >
                        Registrar decisión
                      </Button>
                    </div>
                  </div>
                ) : candidate.duplicate.resolved ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    Decisión de duplicidad resuelta
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    La resolución requiere permiso de revisión para este
                    cliente.
                  </p>
                )}
              </section>

              <Alert>
                <ShieldCheck />
                <AlertTitle>Riesgo editorial</AlertTitle>
                <AlertDescription>{candidate.risk}</AlertDescription>
              </Alert>
            </>
          )}

          {tab === "debate" && (
            <>
              <Alert className="border-primary/15 bg-secondary/45">
                <MessageSquareText />
                <AlertTitle>Conclusiones auditables</AlertTitle>
                <AlertDescription>
                  Se muestran resultados, criterios, motor y hallazgos
                  verificables. I HERE no presenta razonamientos privados como
                  explicación.
                </AlertDescription>
              </Alert>
              {candidate.agents.length === 0 ? (
                <Alert>
                  <Clock3 />
                  <AlertTitle>
                    Evaluación{" "}
                    {candidate.evaluationStatus === "RUNNING"
                      ? "en ejecución"
                      : "pendiente"}
                  </AlertTitle>
                  <AlertDescription>
                    La solicitud continúa en cola o ejecución. Los resultados
                    aparecerán automáticamente; I HERE no mostrará conclusiones
                    antes de que el motor termine.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-3">
                {candidate.agents.map((agent) => (
                  <article key={agent.agent} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{agent.agent}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {agent.summary}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          agent.verdict === "favorable" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-700",
                          agent.verdict === "attention" &&
                            "border-amber-200 bg-amber-50 text-amber-800",
                          agent.verdict === "blocked" &&
                            "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        {agent.score}/100
                      </Badge>
                    </div>
                    {agent.engine ? (
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {agent.engine}
                        {agent.durationMs !== undefined
                          ? ` · ${agent.durationMs} ms`
                          : ""}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agent.findings.map((finding) => (
                        <Badge key={finding} variant="secondary">
                          {finding}
                        </Badge>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="space-y-1">
              {candidate.history.map((entry, index) => (
                <div key={entry.id} className="relative flex gap-3 pb-5">
                  {index < candidate.history.length - 1 && (
                    <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />
                  )}
                  <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-card">
                    <Clock3 className="size-3.5 text-muted-foreground" />
                  </span>
                  <div className="pt-0.5">
                    <p className="text-xs font-bold">{entry.action}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {entry.detail}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {entry.actor} · {entry.at}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />
      <SheetFooter className="grid grid-cols-1 gap-3 bg-card px-6 py-5 sm:grid-cols-3">
        <div className="space-y-2.5 sm:col-span-3">
          <Label htmlFor={`decision-reason-${candidate.id}`}>
            Motivo de la decisión
          </Label>
          <Textarea
            id={`decision-reason-${candidate.id}`}
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            placeholder="Explica brevemente el criterio humano aplicado…"
            className="min-h-20 px-3.5 py-3"
            disabled={busy || terminal}
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            onDecision(candidate.id, "reject", decisionReason.trim())
          }
          disabled={
            busy ||
            terminal ||
            !permissions.canReview ||
            decisionReason.trim().length < 5
          }
        >
          <CircleX />
          Rechazar
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onDecision(candidate.id, "changes", decisionReason.trim())
          }
          disabled={
            busy ||
            terminal ||
            !permissions.canReview ||
            decisionReason.trim().length < 5
          }
        >
          <PencilLine />
          Pedir cambios
        </Button>
        <Button
          onClick={() => onShare(candidate)}
          disabled={
            busy || !permissions.canShare || !approvalAllowed || terminal
          }
        >
          <Send />
          Enviar a Adecco
        </Button>
      </SheetFooter>
    </>
  );
}

function EditField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20 bg-card px-3.5 py-3"
      />
    </div>
  );
}
