import type { TitleCandidate, TitleCorrectionType, TitleStatus } from "./types";

export const titleStatusLabels: Record<TitleStatus, string> = {
  draft: "Borrador",
  proposed: "Propuesto",
  evaluating: "En evaluación",
  changes_requested: "Requiere cambios",
  approved: "Aprobado",
  rejected: "Rechazado",
  used: "Utilizado",
  archived: "No seleccionado",
};

export const correctionTypeLabels: Record<TitleCorrectionType, string> = {
  permanent_preference: "Preferencia permanente",
  factual_correction: "Corrección factual",
  tone_adjustment: "Ajuste de tono",
  intent_change: "Cambio de intención",
  one_off: "Decisión excepcional",
};

export function getTitleBlockingReasons(candidate: TitleCandidate) {
  const reasons: string[] = [];
  if (["approved", "rejected", "used", "archived"].includes(candidate.status))
    return reasons;
  if (candidate.duplicate.level === "high" && !candidate.duplicate.resolved) {
    reasons.push(
      "La duplicidad alta todavía no tiene una decisión humana registrada.",
    );
  }
  if (candidate.agents.some((agent) => agent.verdict === "blocked")) {
    reasons.push("Existe un bloqueo especializado pendiente de resolver.");
  }
  if (candidate.persisted && candidate.evaluationStatus !== "COMPLETED") {
    reasons.push("La evaluación especializada todavía no ha finalizado.");
  }
  if (
    candidate.persisted &&
    candidate.evaluationStatus === "COMPLETED" &&
    candidate.score < 80
  ) {
    reasons.push("La evaluación no alcanza el mínimo de 80 puntos.");
  }
  return reasons;
}

export function canApproveTitle(candidate: TitleCandidate) {
  if (["approved", "rejected", "used", "archived"].includes(candidate.status))
    return false;
  return getTitleBlockingReasons(candidate).length === 0;
}

export function titleStatusTone(status: TitleStatus) {
  return {
    draft: "border-slate-200 bg-slate-50 text-slate-700",
    proposed: "border-violet-200 bg-violet-50 text-violet-700",
    evaluating: "border-blue-200 bg-blue-50 text-blue-700",
    changes_requested: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
    used: "border-slate-200 bg-slate-100 text-slate-700",
    archived: "border-slate-200 bg-slate-50 text-slate-600",
  }[status];
}

export function duplicateTone(level: TitleCandidate["duplicate"]["level"]) {
  return {
    low: "border-emerald-200 bg-emerald-50 text-emerald-700",
    medium: "border-amber-200 bg-amber-50 text-amber-800",
    high: "border-rose-200 bg-rose-50 text-rose-700",
  }[level];
}
