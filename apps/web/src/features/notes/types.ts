export type NoteStatus =
  | "DRAFT"
  | "GENERATING"
  | "QA_QUEUED"
  | "QA_RUNNING"
  | "CHANGES_REQUESTED"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPORTED"
  | "ARCHIVED";

export type EvaluationStatus =
  "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type EvaluationVerdict = "PASS" | "REVIEW" | "BLOCK" | "ERROR";

export type ApiNoteSummary = {
  id: string;
  clientId: string;
  titleProposalId: string;
  status: NoteStatus;
  currentVersion: number;
  clientApprovedCurrentVersion: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: { name: string; slug: string };
  titleProposal: {
    generationRun: {
      id: string;
      campaignYear: number | null;
      campaignMonth: number | null;
      campaignTopic: string | null;
      editorialFolderKey: string | null;
      createdAt: string;
    } | null;
  };
  versions: Array<{
    title: string;
    metaDescription: string | null;
    wordCount: number;
    contentHash: string;
    authorName: string | null;
    _count: { sources: number };
  }>;
  qaEvaluations: Array<{
    version: number;
    status: EvaluationStatus;
    verdict: EvaluationVerdict | null;
    overallScore: number | null;
    criticalBlockers: unknown;
    createdAt: string;
  }>;
};

export type ExportArtifactSummary = {
  id: string;
  noteId: string;
  version: number;
  format: "HTML" | "DOCX" | "PDF";
  status: "QUEUED" | "GENERATING" | "READY" | "FAILED" | "INVALID";
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  errorMessage: string | null;
  verifiedAt: string | null;
  sentToEmail: string | null;
  sentByEmail: string | null;
  emailSubject: string | null;
  externalMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  note: {
    status: NoteStatus;
    client: { name: string; slug: string };
    versions: Array<{ title: string }>;
  };
};

export type NoteBlock = {
  id: string;
  type:
    | "heading"
    | "paragraph"
    | "bullet_list"
    | "ordered_list"
    | "quote"
    | "callout";
  text?: string;
  level?: 2 | 3 | 4;
  items?: string[];
};

export type ApiNoteDetail = Omit<
  ApiNoteSummary,
  "versions" | "qaEvaluations" | "titleProposal" | "clientApprovedCurrentVersion"
> & {
  briefSnapshot: Record<string, unknown>;
  titleProposal: {
    id: string;
    title: string;
    objective: string;
    audience: string;
    searchIntent: string;
    focus: string;
  };
  versions: Array<{
    id: string;
    version: number;
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
    slug: string | null;
    excerpt: string | null;
    content: { schemaVersion: 1; blocks: NoteBlock[] };
    wordCount: number;
    contentHash: string;
    source: string;
    correctionType: string | null;
    changeReason: string | null;
    authorName: string | null;
    authorRole: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    internalLinks: unknown;
    createdAt: string;
    sources: Array<{
      id: string;
      type: "PRIMARY" | "ADECCO_KNOWLEDGE" | "RECOGNIZED_SECONDARY" | "CONTEXT";
      title: string;
      entity: string;
      url: string;
      publishedAt: string | null;
      accessedAt: string;
    }>;
  }>;
  qaEvaluations: Array<{
    id: string;
    version: number;
    status: EvaluationStatus;
    verdict: EvaluationVerdict | null;
    overallScore: number | null;
    summary: string | null;
    criticalBlockers: unknown;
    createdAt: string;
    results: Array<{
      id: string;
      dimension: string;
      score: number;
      maxScore: number;
      verdict: EvaluationVerdict;
      summary: string;
      findings: unknown;
      evidence: unknown;
      ruleVersion: string;
    }>;
  }>;
  decisions: Array<{
    id: string;
    version: number;
    type: string;
    reason: string;
    createdAt: string;
  }>;
  clientReviewLinks?: Array<{
    id: string;
    version: number;
    status: string;
    createdAt: string;
    decision: {
      type: "APPROVE" | "REQUEST_CHANGES" | "REJECT";
      reason: string;
      reviewerName: string;
      createdAt: string;
    } | null;
  }>;
  imageProposals?: Array<{
    id: string;
    version: number;
    concept: string;
    prompt: string;
    altText: string;
    caption: string | null;
    referenceUrl: string | null;
    status: "PROPOSED" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    decisionReason: string | null;
    approvedAt: string | null;
    approvedBy: { id: string; displayName: string } | null;
  }>;
  exports: Array<{
    id: string;
    version: number;
    format: "HTML" | "DOCX" | "PDF";
    status: string;
    fileName: string | null;
    contentHash: string | null;
    createdAt: string;
  }>;
};

export const noteStatusLabels: Record<NoteStatus, string> = {
  DRAFT: "Borrador",
  GENERATING: "Generando",
  QA_QUEUED: "QA en cola",
  QA_RUNNING: "QA en curso",
  CHANGES_REQUESTED: "Cambios solicitados",
  READY_FOR_REVIEW: "Lista para revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  EXPORTED: "Exportada",
  ARCHIVED: "Archivada",
};
