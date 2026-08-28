import { EvaluationVerdict } from '../generated/prisma/client';
import type {
  DuplicateEvaluation,
  EvaluationTitle,
} from './title-evaluation.types';
import { TitleRuleEvaluatorService } from './title-rule-evaluator.service';

describe('TitleRuleEvaluatorService', () => {
  const service = new TitleRuleEvaluatorService();
  const proposal: EvaluationTitle = {
    id: 'proposal-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    title:
      'Cómo identificar puestos críticos para asegurar la continuidad del negocio',
    canonicalTitle:
      'como identificar puestos criticos para asegurar la continuidad del negocio',
    service: 'Training & Consulting',
    objective:
      'Ayudar a líderes de recursos humanos a identificar posiciones que sostienen la operación.',
    audience: 'Líderes y responsables de recursos humanos',
    searchIntent: 'Aprender a identificar puestos críticos',
    focus: 'puestos críticos, continuidad y planificación del negocio',
    opportunity:
      'Aportar una metodología clara para priorizar posiciones esenciales.',
    risk: 'Evitar promesas absolutas o afirmaciones normativas sin respaldo.',
    currentVersion: 1,
  };
  const unique: DuplicateEvaluation = {
    score: 8,
    verdict: EvaluationVerdict.PASS,
    summary: 'Sin coincidencias relevantes.',
    findings: ['Duplicidad baja'],
    evidence: { algorithm: 'test' },
  };

  it('aprueba por reglas una propuesta completa y sin bloqueos', () => {
    const result = service.evaluate(proposal, unique);

    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.verdict).toBe(EvaluationVerdict.PASS);
    expect(result.agentResults).toHaveLength(4);
    expect(
      result.agentResults.every((agent) => agent.provider === 'ihere-rules'),
    ).toBe(true);
  });

  it('bloquea una duplicidad alta aunque el contenido esté completo', () => {
    const result = service.evaluate(proposal, {
      ...unique,
      score: 88,
      verdict: EvaluationVerdict.BLOCK,
    });

    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.agentResults.at(-1)?.findings.join(' ')).toContain(
      'duplicidad',
    );
  });

  it('bloquea propuestas con oportunidad o riesgo pendientes', () => {
    const result = service.evaluate(
      {
        ...proposal,
        opportunity: null,
        risk: 'Pendiente de revisión editorial.',
      },
      unique,
    );

    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(
      result.agentResults.flatMap((agent) => agent.findings).join(' '),
    ).toMatch(/pendientes|oportunidad y el riesgo/i);
  });
});
