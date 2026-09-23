"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TitlePackageGroup } from "./title-packages";

export type InternalPackageDecisionType =
  "APPROVE" | "REQUEST_CHANGES" | "REJECT";

export type InternalPackageDecision = {
  proposalId: string;
  expectedVersion: number;
  type: InternalPackageDecisionType;
  reason?: string;
};

type ItemDecision = {
  type: InternalPackageDecisionType | null;
  reason: string;
};

const decisionOptions = [
  {
    type: "APPROVE" as const,
    label: "Aprobar",
    icon: CheckCircle2,
    active: "border-emerald-500 bg-emerald-50 text-emerald-800",
  },
  {
    type: "REQUEST_CHANGES" as const,
    label: "Observar",
    icon: MessageSquareText,
    active: "border-amber-500 bg-amber-50 text-amber-900",
  },
  {
    type: "REJECT" as const,
    label: "Rechazar",
    icon: CircleX,
    active: "border-rose-500 bg-rose-50 text-rose-800",
  },
];

export function InternalTitlePackageReviewDialog({
  group,
  approvalTarget,
  busy,
  onClose,
  onSubmit,
}: {
  group: TitlePackageGroup;
  approvalTarget: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (decisions: InternalPackageDecision[]) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() =>
    Object.fromEntries(
      group.candidates.map((candidate) => [
        candidate.id,
        { type: null, reason: "" },
      ]),
    ),
  );
  const summary = useMemo(() => {
    const values = Object.values(decisions);
    return {
      approved: values.filter((item) => item.type === "APPROVE").length,
      reviewed: values.filter((item) => item.type !== null).length,
    };
  }, [decisions]);
  const active = group.candidates[activeIndex];
  const activeDecision = decisions[active.id];
  const targetReached = summary.approved === approvalTarget;
  const allReviewed = summary.reviewed === group.candidates.length;

  const toggle = (type: InternalPackageDecisionType) => {
    setDecisions((current) => {
      const item = current[active.id];
      const removing = item.type === type;
      if (
        type === "APPROVE" &&
        !removing &&
        summary.approved >= approvalTarget
      ) {
        setError(
          `Ya seleccionaste los ${approvalTarget} títulos necesarios para este paquete.`,
        );
        return current;
      }
      return {
        ...current,
        [active.id]: {
          type: removing ? null : type,
          reason: type === "APPROVE" ? "" : item.reason,
        },
      };
    });
    setError(null);
  };

  const submit = () => {
    const selected = group.candidates.flatMap((candidate) => {
      const decision = decisions[candidate.id];
      if (!decision.type) return [];
      return [
        {
          proposalId: candidate.id,
          expectedVersion: candidate.currentVersion ?? 1,
          type: decision.type,
          ...(decision.type === "APPROVE"
            ? {}
            : { reason: decision.reason.trim() }),
        },
      ];
    });
    if (!targetReached && !allReviewed) {
      setError(
        `Aprueba ${approvalTarget} títulos o registra una decisión para cada alternativa.`,
      );
      return;
    }
    if (
      selected.some(
        (decision) =>
          decision.type !== "APPROVE" &&
          (decision.reason?.trim().length ?? 0) < 5,
      )
    ) {
      setError("Explica cada observación o rechazo con al menos 5 caracteres.");
      return;
    }
    onSubmit(selected);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <ShieldCheck className="size-3" /> Revisión interna
            </Badge>
            <Badge variant="outline">{group.candidates.length} títulos</Badge>
          </div>
          <DialogTitle className="pt-2">
            Revisar y aprobar el paquete
          </DialogTitle>
          <DialogDescription>
            Puedes resolver el paquete aquí sin generar un enlace para el
            cliente. La decisión quedará en el historial con tu usuario.
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border bg-secondary/20 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <strong>
              {summary.approved} de {approvalTarget} títulos aprobados
            </strong>
            <span className="text-xs text-muted-foreground">
              {targetReached
                ? "Ya puedes confirmar la revisión"
                : "También puedes observar o rechazar"}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${Math.min(100, (summary.approved / Math.max(approvalTarget, 1)) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {group.candidates.map((candidate, index) => {
              const decision = decisions[candidate.id];
              const Icon =
                decision.type === "APPROVE"
                  ? CheckCircle2
                  : decision.type === "REQUEST_CHANGES"
                    ? MessageSquareText
                    : decision.type === "REJECT"
                      ? CircleX
                      : Clock3;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${activeIndex === index ? "border-primary ring-2 ring-primary/15" : "bg-background"}`}
                >
                  <Icon className="size-3.5" /> Título {index + 1} ·{" "}
                  {decision.type === "APPROVE"
                    ? "Aprobado"
                    : decision.type === "REQUEST_CHANGES"
                      ? "Observado"
                      : decision.type === "REJECT"
                        ? "Rechazado"
                        : "Pendiente"}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              Título {activeIndex + 1} de {group.candidates.length}
            </Badge>
            <Badge variant="outline">{active.score}/100</Badge>
          </div>
          <h2 className="mt-3 text-xl font-bold leading-8">{active.title}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Objetivo", active.objective],
              ["Público", active.audience],
              ["Intención", active.intent],
              ["Enfoque", active.focus],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-muted/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-6">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {decisionOptions.map(
              ({ type, label, icon: Icon, active: tone }) => (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  className={activeDecision.type === type ? tone : ""}
                  onClick={() => toggle(type)}
                  disabled={busy}
                >
                  <Icon /> {label}
                </Button>
              ),
            )}
          </div>
          {activeDecision.type && activeDecision.type !== "APPROVE" ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor={`internal-reason-${active.id}`}>
                Motivo de la decisión
              </Label>
              <Textarea
                id={`internal-reason-${active.id}`}
                value={activeDecision.reason}
                onChange={(event) => {
                  const reason = event.target.value;
                  setDecisions((current) => ({
                    ...current,
                    [active.id]: { ...current[active.id], reason },
                  }));
                  setError(null);
                }}
                placeholder="Explica qué debe corregirse o por qué se rechaza…"
                className="min-h-24"
                disabled={busy}
              />
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
            Confirmar revisión interna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
