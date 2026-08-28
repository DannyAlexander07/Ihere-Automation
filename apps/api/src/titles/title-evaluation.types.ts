import type { AgentType, EvaluationVerdict } from '../generated/prisma/client';

export type EvaluationTitle = {
  id: string;
  tenantId: string;
  clientId: string;
  service: string;
  title: string;
  canonicalTitle: string;
  objective: string;
  audience: string;
  searchIntent: string;
  focus: string;
  opportunity: string | null;
  risk: string | null;
  currentVersion: number;
};

export type ComparableTitle = Pick<
  EvaluationTitle,
  'id' | 'title' | 'canonicalTitle' | 'searchIntent' | 'focus'
> & {
  status: string;
  createdAt: Date;
};

export type DuplicateEvaluation = {
  score: number;
  verdict: EvaluationVerdict;
  summary: string;
  findings: string[];
  evidence: Record<string, unknown>;
  related?: ComparableTitle;
};

export type RuleAgentResult = {
  agentType: AgentType;
  verdict: EvaluationVerdict;
  score: number;
  summary: string;
  findings: string[];
  evidence: Record<string, unknown>;
  provider: 'ihere-rules';
  model: string;
};

export type RuleEvaluation = {
  overallScore: number;
  verdict: EvaluationVerdict;
  summary: string;
  agentResults: RuleAgentResult[];
};
