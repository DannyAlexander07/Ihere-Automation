import type {
  AgentInsight,
  TitleCandidate,
  TitleHistoryEntry,
  TitleStatus,
} from "./types";

export type ApiClientSummary = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

export type ApiAgentResult = {
  id: string;
  agentType: string;
  verdict: "PASS" | "REVIEW" | "BLOCK" | "ERROR";
  score: number | null;
  summary: string;
  findings: unknown;
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
};

export type ApiEvaluation = {
  id?: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  verdict: "PASS" | "REVIEW" | "BLOCK" | "ERROR" | null;
  overallScore: number | null;
  summary?: string | null;
  createdAt: string;
  agentResults?: ApiAgentResult[];
};

export type ApiTitle = {
  id: string;
  clientId: string;
  title: string;
  objective: string;
  audience: string;
  searchIntent: string;
  focus: string;
  opportunity: string | null;
  risk: string | null;
  status:
    | "DRAFT"
    | "PROPOSED"
    | "EVALUATING"
    | "CHANGES_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "USED"
    | "ARCHIVED";
  duplicateScore: number;
  duplicateResolution:
    | "PENDING"
    | "UNIQUE"
    | "CREATE_NEW"
    | "COMPLEMENT"
    | "UPDATE_EXISTING"
    | "MERGE"
    | "DISCARD";
  currentVersion: number;
  generationRunId?: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id?: string; name: string; slug: string };
  createdBy?: { displayName: string };
  generationRun?: {
    id: string;
    createdAt: string;
    campaignYear: number | null;
    campaignMonth: number | null;
    campaignTopic: string | null;
    editorialFolderKey: string | null;
    inputSnapshot: unknown;
    requestedBy: { displayName: string };
  } | null;
  titlePackageReviewItems?: Array<{
    version: number;
    link: { createdAt: string };
    decision: {
      type: "APPROVE" | "REQUEST_CHANGES" | "REJECT";
      reason: string;
      createdAt: string;
    } | null;
  }>;
  duplicateOf?: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  } | null;
  evaluations: ApiEvaluation[];
  versions?: Array<{
    id: string;
    version: number;
    title: string;
    changeReason: string | null;
    correctionType: string | null;
    source: string;
    createdAt: string;
  }>;
  decisions?: Array<{
    id: string;
    type: string;
    reason: string;
    version: number;
    duplicateResolution: string | null;
    createdAt: string;
  }>;
};

const statusMap: Record<ApiTitle["status"], TitleStatus> = {
  DRAFT: "draft",
  PROPOSED: "proposed",
  EVALUATING: "evaluating",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  USED: "used",
  ARCHIVED: "archived",
};

const agentNameMap: Record<string, AgentInsight["agent"]> = {
  SEO_STRATEGIST: "Estratega SEO",
  BRAND_EDITOR: "Editor de marca",
  DUPLICATE_DETECTOR: "Detector de duplicidad",
  JUDGE: "Juez",
  RESEARCHER: "Investigador",
  GEO_AEO_AUDITOR: "Auditor GEO/AEO",
  NORMATIVE_AUDITOR: "Auditor normativo",
  QA_EDITOR: "Editor QA",
};

const recommendationMap: Record<
  ApiTitle["duplicateResolution"],
  TitleCandidate["duplicate"]["recommendation"]
> = {
  PENDING: "Crear",
  UNIQUE: "Crear",
  CREATE_NEW: "Crear",
  COMPLEMENT: "Complementar",
  UPDATE_EXISTING: "Actualizar",
  MERGE: "Fusionar",
  DISCARD: "Descartar",
};

const decisionLabels: Record<string, string> = {
  APPROVE: "Título aprobado",
  REJECT: "Título rechazado",
  REQUEST_CHANGES: "Cambios solicitados",
  MARK_USED: "Título marcado como utilizado",
  RESOLVE_DUPLICATE: "Duplicidad resuelta",
};

const dateTime = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const month = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
});

function findingsFrom(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    return Object.values(value).filter(
      (item): item is string => typeof item === "string",
    );
  }
  return [];
}

function mapAgents(evaluation: ApiEvaluation | undefined): AgentInsight[] {
  return (evaluation?.agentResults ?? []).map((agent) => ({
    agent: agentNameMap[agent.agentType] ?? "Especialista",
    verdict:
      agent.verdict === "PASS"
        ? "favorable"
        : agent.verdict === "BLOCK" || agent.verdict === "ERROR"
          ? "blocked"
          : "attention",
    score: agent.score ?? 0,
    summary: agent.summary,
    findings: findingsFrom(agent.findings),
    engine:
      agent.provider === "ihere-rules"
        ? `Reglas I HERE · ${agent.model ?? "versión registrada"}`
        : agent.provider && agent.model
          ? `${agent.provider} · ${agent.model}`
          : undefined,
    durationMs: agent.durationMs ?? undefined,
  }));
}

function mapHistory(title: ApiTitle): TitleHistoryEntry[] {
  const clientReviews = (title.titlePackageReviewItems ?? []).flatMap((item) =>
    item.decision
      ? [
          {
            timestamp: new Date(item.decision.createdAt).getTime(),
            entry: {
              id: `client:${item.version}:${item.decision.createdAt}`,
              action:
                item.decision.type === "APPROVE"
                  ? "Cliente aprobó el título"
                  : item.decision.type === "REQUEST_CHANGES"
                    ? "Cliente solicitó cambios"
                    : "Cliente rechazó el título",
              actor: "Cliente autorizado",
              at: dateTime.format(new Date(item.decision.createdAt)),
              detail: item.decision.reason,
            },
          },
        ]
      : [],
  );
  const decisions = (title.decisions ?? []).map((decision) => ({
    timestamp: new Date(decision.createdAt).getTime(),
    entry: {
      id: decision.id,
      action: decisionLabels[decision.type] ?? "Decisión registrada",
      actor: "Usuario autorizado",
      at: dateTime.format(new Date(decision.createdAt)),
      detail: decision.reason,
    },
  }));
  const versions = (title.versions ?? []).map((version) => ({
    timestamp: new Date(version.createdAt).getTime(),
    entry: {
      id: version.id,
      action:
        version.version === 1
          ? "Título creado"
          : `Versión ${version.version} registrada`,
      actor:
        version.source === "AI_ASSISTED"
          ? "Asistencia automatizada"
          : "Usuario autorizado",
      at: dateTime.format(new Date(version.createdAt)),
      detail:
        version.changeReason ??
        `Versión ${version.version}: “${version.title}”.`,
    },
  }));
  return [...clientReviews, ...decisions, ...versions]
    .toSorted((a, b) => b.timestamp - a.timestamp)
    .map((item) => item.entry);
}

function packageTopic(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return "Propuestas editoriales";
  const request = (snapshot as Record<string, unknown>).request;
  if (!request || typeof request !== "object" || Array.isArray(request))
    return "Propuestas editoriales";
  const topic = (request as Record<string, unknown>).topic;
  return typeof topic === "string" && topic.trim()
    ? topic.trim()
    : "Propuestas editoriales";
}

export function mapApiTitle(title: ApiTitle, owner: string): TitleCandidate {
  const evaluation = title.evaluations[0];
  const duplicateLevel =
    title.duplicateScore >= 75
      ? "high"
      : title.duplicateScore >= 40
        ? "medium"
        : "low";
  const tags = title.title
    .toLocaleLowerCase("es")
    .replace(/[^a-záéíóúüñ0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length > 5)
    .slice(0, 3);

  const latestClientFeedback = (title.titlePackageReviewItems ?? [])
    .flatMap((item) =>
      item.decision
        ? [
            {
              type: item.decision.type,
              reason: item.decision.reason,
              version: item.version,
              createdAt: item.decision.createdAt,
            },
          ]
        : [],
    )
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const created = new Date(title.generationRun?.createdAt ?? title.createdAt);
  return {
    id: title.id,
    clientId: title.clientId,
    currentVersion: title.currentVersion,
    persisted: true,
    package: title.generationRun
      ? {
          id: title.generationRun.id,
          topic:
            title.generationRun.campaignTopic ??
            packageTopic(title.generationRun.inputSnapshot),
          year: title.generationRun.campaignYear ?? created.getUTCFullYear(),
          month: title.generationRun.campaignMonth ?? created.getUTCMonth() + 1,
          folderKey:
            title.generationRun.editorialFolderKey ??
            `${title.client.slug}/${created.getUTCFullYear()}/${String(created.getUTCMonth() + 1).padStart(2, "0")}/${title.generationRun.id}`,
          createdAt: title.generationRun.createdAt,
          requestedBy: title.generationRun.requestedBy.displayName,
        }
      : undefined,
    clientFeedback: latestClientFeedback,
    title: title.title,
    client: title.client.name,
    campaign: month.format(new Date(title.createdAt)),
    objective: title.objective,
    audience: title.audience,
    intent: title.searchIntent,
    focus: title.focus,
    opportunity: title.opportunity ?? "Pendiente de completar.",
    risk: title.risk ?? "Pendiente de revisión editorial.",
    status: statusMap[title.status],
    score: evaluation?.overallScore ?? 0,
    evaluationStatus: evaluation?.status,
    evaluationVerdict: evaluation?.verdict ?? undefined,
    owner: title.createdBy?.displayName ?? owner,
    createdAtIso: title.createdAt,
    updatedAt: dateTime.format(new Date(title.updatedAt)),
    tags: tags.length ? tags : ["sin etiquetas"],
    duplicate: {
      score: title.duplicateScore,
      level: duplicateLevel,
      relatedTitle: title.duplicateOf?.title ?? "Sin coincidencias registradas",
      relatedDate: title.duplicateOf
        ? dateTime.format(new Date(title.duplicateOf.createdAt))
        : "Historial del cliente",
      recommendation: recommendationMap[title.duplicateResolution],
      resolved:
        title.duplicateScore < 75 || title.duplicateResolution !== "PENDING",
      relatedId: title.duplicateOf?.id,
    },
    agents: mapAgents(evaluation),
    history: mapHistory(title),
  };
}
