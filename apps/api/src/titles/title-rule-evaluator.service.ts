import { Injectable } from '@nestjs/common';
import { AgentType, EvaluationVerdict } from '../generated/prisma/client';
import type {
  DuplicateEvaluation,
  EvaluationTitle,
  RuleAgentResult,
  RuleEvaluation,
} from './title-evaluation.types';
import type { GlossaryFinding } from '../learning/editorial-glossary';

const actionTerms = new Set([
  'como',
  'claves',
  'consejos',
  'estrategias',
  'guia',
  'identificar',
  'mejorar',
  'pasos',
  'prevenir',
  'que',
  'recomendaciones',
]);

@Injectable()
export class TitleRuleEvaluatorService {
  evaluate(
    proposal: EvaluationTitle,
    duplicate: DuplicateEvaluation,
    glossaryFindings: GlossaryFinding[] = [],
  ): RuleEvaluation {
    const title = proposal.title.trim();
    const titleWords = this.words(title);
    const focusWords = this.words(proposal.focus);
    const titleFocusOverlap = titleWords.filter((word) =>
      focusWords.includes(word),
    ).length;
    const hasPlaceholder = /\b(tbd|pendiente|lorem|xxx|por definir)\b/i.test(
      `${title} ${proposal.objective} ${proposal.focus} ${proposal.opportunity ?? ''} ${proposal.risk ?? ''}`,
    );
    const hasCompleteContext = Boolean(
      proposal.opportunity?.trim() && proposal.risk?.trim(),
    );
    const cleanPunctuation = !/[!?.,:;]{2,}/.test(title);
    const naturalCapitalization =
      title.length < 8 || title !== title.toLocaleUpperCase('es');
    const isVague = /^(todo|cosas|tema|informacion|novedades)\b/i.test(title);
    const hasActionTerm = titleWords.some((word) => actionTerms.has(word));

    const dimensions = {
      intentUtility:
        this.points(proposal.objective.length >= 40, 8, 4) +
        this.points(proposal.audience.length >= 12, 5, 2) +
        this.points(proposal.searchIntent.length >= 8, 4, 1) +
        this.points(proposal.focus.length >= 18, 3, 1),
      originality:
        this.points((proposal.opportunity?.length ?? 0) >= 25, 8, 3) +
        this.points((proposal.risk?.length ?? 0) >= 15, 4, 2) +
        (duplicate.score < 40 ? 8 : duplicate.score < 75 ? 4 : 0),
      clarity:
        (title.length >= 35 && title.length <= 95
          ? 7
          : title.length >= 20 && title.length <= 140
            ? 4
            : 0) +
        (titleWords.length >= 6 && titleWords.length <= 16 ? 4 : 2) +
        (cleanPunctuation && naturalCapitalization ? 4 : 1),
      seo:
        this.points(proposal.searchIntent.length >= 8, 5, 1) +
        this.points(titleFocusOverlap >= 1, 5, 1) +
        (title.length >= 45 && title.length <= 75
          ? 5
          : title.length >= 30 && title.length <= 95
            ? 3
            : 0),
      geoAeo:
        this.points(proposal.audience.length >= 12, 5, 2) +
        this.points(proposal.focus.length >= 18, 5, 2) +
        this.points(!isVague, 5, 1),
      action:
        this.points(proposal.objective.length >= 40, 5, 2) +
        this.points(hasActionTerm, 5, 2),
      finalQuality:
        hasPlaceholder || !cleanPunctuation || !naturalCapitalization ? 1 : 5,
    };

    const blockers = [
      ...(title.length < 20 ? ['El título tiene menos de 20 caracteres'] : []),
      ...(title.length > 140 ? ['El título supera 140 caracteres'] : []),
      ...(titleWords.length < 4
        ? ['El título tiene menos de cuatro palabras útiles']
        : []),
      ...(hasPlaceholder
        ? ['Existen textos pendientes o marcadores de posición']
        : []),
      ...(!hasCompleteContext
        ? ['La oportunidad y el riesgo editorial son obligatorios']
        : []),
      ...(duplicate.score >= 75
        ? ['La duplicidad alta requiere una decisión humana']
        : []),
      ...glossaryFindings.map(
        (finding) =>
          `Terminología no autorizada: reemplaza “${finding.matchedVariant}” por “${finding.preferredTerm}”${finding.guidance ? ` (${finding.guidance})` : ''}`,
      ),
    ];
    const overallScore = Object.values(dimensions).reduce(
      (total, value) => total + value,
      0,
    );
    const verdict = blockers.length
      ? EvaluationVerdict.BLOCK
      : overallScore >= 80
        ? EvaluationVerdict.PASS
        : EvaluationVerdict.REVIEW;

    const seoScore = Math.round(
      ((dimensions.intentUtility + dimensions.seo + dimensions.geoAeo) / 50) *
        100,
    );
    const qaScore = Math.round(
      ((dimensions.clarity + dimensions.action + dimensions.finalQuality) /
        30) *
        100,
    );
    const duplicateScore = 100 - duplicate.score;
    const agentResults: RuleAgentResult[] = [
      {
        agentType: AgentType.DUPLICATE_DETECTOR,
        verdict: duplicate.verdict,
        score: duplicateScore,
        summary: duplicate.summary,
        findings: duplicate.findings,
        evidence: duplicate.evidence,
        provider: 'ihere-rules',
        model: 'title-similarity-v1',
      },
      {
        agentType: AgentType.SEO_STRATEGIST,
        verdict:
          seoScore >= 80 ? EvaluationVerdict.PASS : EvaluationVerdict.REVIEW,
        score: seoScore,
        summary:
          seoScore >= 80
            ? 'La intención, el foco y la extensión del título están bien definidos.'
            : 'La intención o el foco del título necesitan mayor precisión editorial.',
        findings: [
          `${titleFocusOverlap} término(s) del enfoque aparecen en el título`,
          `${title.length} caracteres en el título`,
          `Intención declarada: ${proposal.searchIntent}`,
        ],
        evidence: {
          engine: 'title-editorial-rubric-v1',
          dimensions: {
            intentUtility: dimensions.intentUtility,
            seo: dimensions.seo,
            geoAeo: dimensions.geoAeo,
          },
        },
        provider: 'ihere-rules',
        model: 'title-editorial-rubric-v1',
      },
      {
        agentType: AgentType.QA_EDITOR,
        verdict:
          blockers.length > 0
            ? EvaluationVerdict.BLOCK
            : qaScore >= 80
              ? EvaluationVerdict.PASS
              : EvaluationVerdict.REVIEW,
        score: qaScore,
        summary:
          blockers.length > 0
            ? 'La revisión detectó bloqueos críticos antes de la aprobación.'
            : 'La revisión verificó claridad, utilidad y calidad formal del título.',
        findings: blockers.length
          ? blockers
          : [
              cleanPunctuation
                ? 'Puntuación limpia'
                : 'Revisar puntuación repetida',
              naturalCapitalization
                ? 'Capitalización natural'
                : 'Evitar el uso completo de mayúsculas',
              hasActionTerm
                ? 'Orientación práctica identificada'
                : 'La orientación práctica puede ser más explícita',
            ],
        evidence: {
          engine: 'title-editorial-rubric-v1',
          dimensions: {
            clarity: dimensions.clarity,
            action: dimensions.action,
            finalQuality: dimensions.finalQuality,
          },
          blockers,
        },
        provider: 'ihere-rules',
        model: 'title-editorial-rubric-v1',
      },
      {
        agentType: AgentType.JUDGE,
        verdict,
        score: overallScore,
        summary:
          verdict === EvaluationVerdict.PASS
            ? 'La propuesta supera el umbral de 80 y no presenta bloqueos críticos.'
            : verdict === EvaluationVerdict.BLOCK
              ? 'La propuesta requiere resolver bloqueos antes de una decisión de aprobación.'
              : 'La propuesta necesita revisión humana o ajustes para alcanzar 80 puntos.',
        findings: blockers.length
          ? blockers
          : [
              `Intención y utilidad: ${dimensions.intentUtility}/20`,
              `Originalidad: ${dimensions.originality}/20`,
              `Claridad: ${dimensions.clarity}/15`,
              `SEO editorial: ${dimensions.seo}/15`,
              `GEO/AEO: ${dimensions.geoAeo}/15`,
              `Orientación a la acción: ${dimensions.action}/10`,
              `Calidad final: ${dimensions.finalQuality}/5`,
            ],
        evidence: {
          engine: 'title-editorial-rubric-v1',
          approvalThreshold: 80,
          dimensions,
          blockers,
        },
        provider: 'ihere-rules',
        model: 'title-editorial-rubric-v1',
      },
    ];

    return {
      overallScore,
      verdict,
      summary: agentResults.at(-1)?.summary ?? 'Evaluación completada.',
      agentResults,
    };
  }

  private words(value: string): string[] {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  private points(condition: boolean, pass: number, fail: number): number {
    return condition ? pass : fail;
  }
}
