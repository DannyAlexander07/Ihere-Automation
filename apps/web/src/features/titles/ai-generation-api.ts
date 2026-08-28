export type AiGenerationStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BUDGET_BLOCKED";

export type TitleSearchIntent =
  "Aprender" | "Comparar" | "Decidir" | "Contratar" | "Resolver";

export type TitleGenerationInput = {
  service: string;
  topic: string;
  objective: string;
  audience: string;
  searchIntent: TitleSearchIntent;
  campaignYear: number;
  campaignMonth: number;
  count: number;
  additionalContext?: string;
};

export type TitleBriefSuggestion = {
  service: string;
  topic: string;
  objective: string;
  audience: string;
  searchIntent: TitleSearchIntent;
  additionalContext: string;
  differentiation: string;
  summary: string;
};

export type ApiAiGenerationRun = {
  id: string;
  status: AiGenerationStatus;
  model: string;
  costMicros: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  agentResults?: Array<{ status: AiGenerationStatus; sequence: number }>;
  titleProposals?: Array<{
    id: string;
    title: string;
    status: string;
    currentVersion: number;
  }>;
  noteVersions?: Array<{
    id: string;
    noteId: string;
    version: number;
    title: string;
  }>;
  output?: {
    suggestion?: TitleBriefSuggestion;
    proposalId?: string;
    version?: number;
  } | null;
};

export type TitleGenerationProgress = {
  status: AiGenerationStatus;
  completedStages: number;
};

export type TitleGenerationSummary = {
  proposalCount: number;
  costMicros: number;
};

export const terminalGenerationStatuses = new Set<AiGenerationStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BUDGET_BLOCKED",
]);

export function generationProgress(
  run: ApiAiGenerationRun,
): TitleGenerationProgress {
  return {
    status: run.status,
    completedStages: Math.min(
      3,
      run.agentResults?.filter((result) => result.status === "COMPLETED")
        .length ?? 0,
    ),
  };
}

export function generationFailureMessage(run: ApiAiGenerationRun): string {
  if (run.status === "BUDGET_BLOCKED") {
    return "El presupuesto disponible para la automatización editorial se alcanzó. Solicita al administrador revisar el límite antes de reintentar.";
  }
  if (run.status === "CANCELLED")
    return "La generación fue cancelada antes de completarse.";
  return (
    run.errorMessage ||
    "La generación no pudo completarse. Puedes reintentar sin perder propuestas anteriores."
  );
}
