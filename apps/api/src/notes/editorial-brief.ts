import type { Prisma } from '../generated/prisma/client';

export type ApprovedTitleContext = {
  id: string;
  service: string;
  title: string;
  slug: string | null;
  objective: string;
  audience: string;
  searchIntent: string;
  focus: string;
  opportunity: string | null;
  risk: string | null;
  approvedAt: Date | null;
};

/**
 * Freezes an operational brief from the exact approved title version.
 * The brief deliberately marks client-owned evidence and service data as
 * requirements instead of inventing Adecco knowledge during note creation.
 */
export function buildEditorialBriefSnapshot(
  title: ApprovedTitleContext,
): Prisma.InputJsonObject {
  const guardrails = [
    title.risk?.trim(),
    'No atribuir a Adecco cifras, metodologías, resultados o experiencia sin respaldo institucional autorizado.',
    'Las afirmaciones normativas o de cumplimiento requieren fuente primaria, alcance y revisión humana especializada.',
    'No prometer resultados garantizados ni inventar servicios, especialistas, enlaces o datos.',
  ].filter((value): value is string => Boolean(value));

  return {
    briefVersion: 3,
    titleProposalId: title.id,
    approvedAt: title.approvedAt?.toISOString() ?? null,
    titles: {
      editorialTitle: title.title,
      h1: title.title,
      seoTitle: null,
      seoTitleRequirement:
        'Redactar durante la nota un título SEO fiel al H1, natural y diferenciado; no copiarlo mecánicamente si pierde claridad.',
      slug: title.slug,
      metaDescription: null,
      metaDescriptionRequirement:
        'Resumir la utilidad concreta de la nota sin promesas absolutas ni frases genéricas.',
    },
    reader: {
      audience: title.audience,
      intent: title.searchIntent,
      objective: title.objective,
      decisionOrNeed: title.objective,
    },
    mainQuestion: `¿Qué necesita comprender, comparar o decidir ${title.audience} sobre “${title.title}”?`,
    directAnswerContract: {
      placement: 'Primeros dos párrafos',
      requirement:
        'Responder de forma directa, comprensible fuera de contexto y sin adelantar una conclusión que la evidencia no sostenga.',
    },
    editorialStructure: {
      opening:
        'Abrir con una tensión, pregunta o decisión real del público; evitar introducciones genéricas.',
      requiredH2: [
        `Contexto y decisión principal: ${title.focus}`,
        'Criterios, pasos o alternativas que el lector debe evaluar',
        'Ejemplo o escenario aplicable al contexto peruano',
        'Recomendaciones, límites y siguiente paso',
      ],
      h3Guidance:
        'Usar H3 solo cuando dividan criterios o pasos reales; cada encabezado debe ayudar a aprender, comparar, decidir o actuar.',
      conclusion:
        'Sintetizar la decisión y orientar el siguiente paso sin repetir la introducción.',
      faqRequirement:
        'Incluir preguntas frecuentes únicamente cuando respondan consultas relacionadas reales y no repitan el cuerpo.',
    },
    differentiation: {
      focus: title.focus,
      opportunity:
        title.opportunity ??
        'Definir un aporte práctico y diferenciador antes de redactar.',
    },
    evidencePlan: {
      sourcePriority: [
        'Fuentes primarias y organismos oficiales',
        'Conocimiento de Adecco expresamente autorizado',
        'Fuentes secundarias reconocidas',
        'Fuentes de contexto',
      ],
      claimRule:
        'Cada afirmación factual relevante debe conservar entidad, fecha, alcance y fuente cercana.',
      adeccoInputRequired: [
        'Confirmar la línea de servicio y su denominación oficial.',
        'Aportar o autorizar datos, experiencia, metodología, especialista o ejemplo propio que se atribuya a Adecco.',
        'Validar cualquier afirmación institucional, normativa o de desempeño sensible.',
      ],
    },
    conversion: {
      service: title.service,
      serviceRequirement: `Mantener la nota alineada con el servicio aprobado “${title.service}” y usar su denominación oficial.`,
      ctaRequirement:
        'Proponer un CTA proporcional a la intención del lector y vinculado a un servicio real; la URL debe confirmarse, no inventarse.',
      internalLinksRequirement:
        'Proponer enlaces internos relevantes y comprobar su URL antes de aprobar la versión.',
    },
    institutionalGuardrails: guardrails,
    qualityContract: {
      targetWords:
        'Entre 1,200 y 1,800 palabras cuando la complejidad lo justifique; priorizar cobertura real y nunca añadir relleno.',
      mandatoryChecks: [
        'Fidelidad al título y al brief aprobado',
        'SEO editorial y diferenciación temática',
        'GEO, citabilidad y contexto',
        'AEO y respuesta temprana',
        'Tono humano y utilidad práctica',
        'Fuentes, CTA, enlaces, ortografía y revisión humana',
      ],
    },
  };
}
