export type TitleStatus =
  | "draft"
  | "proposed"
  | "evaluating"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "used"
  | "archived";

export type DuplicateLevel = "low" | "medium" | "high";

export type AgentInsight = {
  agent:
    | "Estratega SEO"
    | "Editor de marca"
    | "Detector de duplicidad"
    | "Juez"
    | "Investigador"
    | "Auditor GEO/AEO"
    | "Auditor normativo"
    | "Editor QA"
    | "Especialista";
  verdict: "favorable" | "attention" | "blocked";
  score: number;
  summary: string;
  findings: string[];
  engine?: string;
  durationMs?: number;
};

export type TitleHistoryEntry = {
  id: string;
  action: string;
  actor: string;
  at: string;
  detail: string;
};

export type TitleCandidate = {
  id: string;
  clientId?: string;
  currentVersion?: number;
  persisted?: boolean;
  package?: {
    id: string;
    topic: string;
    year: number;
    month: number;
    folderKey: string;
    createdAt: string;
    requestedBy: string;
  };
  clientFeedback?: {
    type: "APPROVE" | "REQUEST_CHANGES" | "REJECT";
    reason: string;
    version: number;
    createdAt: string;
  };
  title: string;
  client: string;
  campaign: string;
  objective: string;
  audience: string;
  intent: string;
  focus: string;
  opportunity: string;
  risk: string;
  status: TitleStatus;
  score: number;
  evaluationStatus?:
    "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  evaluationVerdict?: "PASS" | "REVIEW" | "BLOCK" | "ERROR";
  owner: string;
  createdAtIso?: string;
  updatedAt: string;
  tags: string[];
  duplicate: {
    score: number;
    level: DuplicateLevel;
    relatedTitle: string;
    relatedDate: string;
    recommendation:
      "Crear" | "Complementar" | "Actualizar" | "Fusionar" | "Descartar";
    resolved: boolean;
    relatedId?: string;
  };
  agents: AgentInsight[];
  history: TitleHistoryEntry[];
};

export type TitleCorrectionType =
  | "permanent_preference"
  | "factual_correction"
  | "tone_adjustment"
  | "intent_change"
  | "one_off";

export type TitleEditorialDraft = {
  title: string;
  objective: string;
  audience: string;
  searchIntent: string;
  focus: string;
  opportunity: string;
  risk: string;
};
