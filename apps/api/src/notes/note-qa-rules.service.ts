import { Injectable } from '@nestjs/common';
import {
  EvaluationVerdict,
  NoteQaDimension,
  NoteSourceType,
  type NoteVersion,
  type NoteSource,
} from '../generated/prisma/client';
import { NoteContentService } from './note-content.service';
import { stripTrackingParameters } from '../common/url-hygiene';
import {
  ADECCO_CLIENT_SLUG,
  ADECCO_CONTACT_URL,
  isAdeccoSpecialistCta,
} from './editorial-cta';

type QaVersion = Pick<
  NoteVersion,
  | 'title'
  | 'metaTitle'
  | 'metaDescription'
  | 'slug'
  | 'excerpt'
  | 'content'
  | 'authorName'
  | 'authorRole'
  | 'ctaText'
  | 'ctaUrl'
  | 'internalLinks'
> & { sources: NoteSource[] };

type DimensionResult = {
  dimension: NoteQaDimension;
  score: number;
  maxScore: number;
  verdict: EvaluationVerdict;
  summary: string;
  findings: string[];
  evidence: Record<string, unknown>;
};

@Injectable()
export class NoteQaRulesService {
  constructor(private readonly contentService: NoteContentService) {}

  evaluate(version: QaVersion, context?: { clientSlug?: string }) {
    const content = version.content as Record<string, unknown>;
    const blocks = Array.isArray(content.blocks)
      ? (content.blocks as Array<Record<string, unknown>>)
      : [];
    const wordCount = this.contentService.wordCount(content);
    const textBlocks = blocks
      .flatMap((block) =>
        Array.isArray(block.items)
          ? block.items.filter(
              (item): item is string => typeof item === 'string',
            )
          : typeof block.text === 'string'
            ? [block.text]
            : [],
      )
      .map((text) => text.trim());
    const allText = textBlocks.join(' ');
    const firstAnswer = blocks.find((block) =>
      ['paragraph', 'callout'].includes(String(block.type)),
    )?.text;
    const firstAnswerLength =
      typeof firstAnswer === 'string' ? firstAnswer.trim().length : 0;
    const firstAnswerText =
      typeof firstAnswer === 'string' ? firstAnswer.trim() : '';
    const genericOpening =
      /^(en (?:un|el) (?:mundo|entorno|contexto) (?:actual|cambiante|competitivo)|hoy en día|en la actualidad|actualmente,?\s+(?:las|los|el|la))/i.test(
        firstAnswerText,
      );
    const normalizedSentences = allText
      .split(/[.!?]+/)
      .map((sentence) =>
        sentence
          .toLocaleLowerCase('es')
          .replace(/[^a-záéíóúüñ0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((sentence) => sentence.length >= 60);
    const sentenceCounts = new Map<string, number>();
    for (const sentence of normalizedSentences) {
      sentenceCounts.set(sentence, (sentenceCounts.get(sentence) ?? 0) + 1);
    }
    const repeatedSentenceCount = [...sentenceCounts.values()].reduce(
      (total, count) => total + Math.max(0, count - 1),
      0,
    );
    const severeMechanicalRepetition =
      normalizedSentences.length >= 6 &&
      repeatedSentenceCount >=
        Math.max(3, Math.ceil(normalizedSentences.length * 0.15));
    const headings = blocks.filter((block) => block.type === 'heading');
    const hasList = blocks.some((block) =>
      ['bullet_list', 'ordered_list'].includes(String(block.type)),
    );
    const hasQuoteOrCallout = blocks.some((block) =>
      ['quote', 'callout'].includes(String(block.type)),
    );
    const hasPrimarySource = version.sources.some(
      (source) =>
        source.type === NoteSourceType.PRIMARY ||
        source.type === NoteSourceType.ADECCO_KNOWLEDGE,
    );
    const datedSources = version.sources.filter(
      (source) => source.publishedAt || source.accessedAt,
    ).length;
    const internalLinks = Array.isArray(version.internalLinks)
      ? version.internalLinks.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const sourceUrls = new Set(
      version.sources.map((source) => this.normalizeUrl(source.url)),
    );
    const internalLinkUrls = new Set(
      internalLinks.map((url) => this.normalizeUrl(url)),
    );
    const ctaUrl = version.ctaUrl ? this.normalizeUrl(version.ctaUrl) : null;
    const rawBodyUrls = this.extractRawUrls(allText);
    const bodyUrls = new Set(this.extractUrls(allText));
    const citedSourceUrls = [...sourceUrls].filter((url) => bodyUrls.has(url));
    const unregisteredExternalUrls = [...bodyUrls].filter(
      (url) =>
        !sourceUrls.has(url) && !internalLinkUrls.has(url) && url !== ctaUrl,
    );
    const trackingUrlCount = [
      ...version.sources.map((source) => source.url),
      ...internalLinks,
      ...(version.ctaUrl ? [version.ctaUrl] : []),
      ...rawBodyUrls,
    ].filter((url) => this.hasTrackingParameter(url)).length;
    const clientSlug = context?.clientSlug ?? '';
    const requiresAdeccoCta = clientSlug === ADECCO_CLIENT_SLUG;
    const hasValidCta = requiresAdeccoCta
      ? isAdeccoSpecialistCta(clientSlug, version)
      : Boolean(version.ctaText) && Boolean(version.ctaUrl);
    const hasPlaceholder =
      /\b(lorem|tbd|xxx|pendiente(?: de)? confirmar|completar luego|por definir|insertar aquí)\b/i.test(
        `${allText} ${version.metaTitle ?? ''} ${version.metaDescription ?? ''}`,
      );
    const normativeClaim =
      /\b(ley|decreto|reglamento|resolución|resolucion|norma|sunat|ministerio|obligatorio|prohibido)\b/i.test(
        allText,
      );
    const primarySourceUrls = new Set(
      version.sources
        .filter((source) => source.type === NoteSourceType.PRIMARY)
        .map((source) => this.normalizeUrl(source.url)),
    );
    const normativeClaimCited = blocks.some((block) => {
      const text = [
        typeof block.text === 'string' ? block.text : '',
        ...(Array.isArray(block.items)
          ? block.items.filter(
              (item): item is string => typeof item === 'string',
            )
          : []),
      ].join(' ');
      return (
        /\b(ley|decreto|reglamento|resolución|resolucion|norma|sunat|ministerio|obligatorio|prohibido)\b/i.test(
          text,
        ) && this.extractUrls(text).some((url) => primarySourceUrls.has(url))
      );
    });
    const absolutePromise =
      /\b(cumplimiento (?:legal |normativo )?garantizado|garantiza(?:r|do)? (?:el )?cumplimiento|asegura(?:r|do)? que [^.]{0,120}\bsiempre\b|siempre (?:cumple|cumplirá|cumplira|cumpla) con (?:la|el) normativa|resultados? garantizados?)\b/i.test(
        allText,
      );
    const unsupportedPerformanceClaim =
      /\b(?:la )?(?:ia|inteligencia artificial|automatización|automatizacion) (?:predice|garantiza|reduce|aumenta|mejora)\b/i.test(
        allText,
      ) && version.sources.length === 0;
    const emptyBlocks = textBlocks.filter((text) => !text).length;

    const dimensions: DimensionResult[] = [
      this.dimension(
        NoteQaDimension.INTENT_UTILITY,
        this.points(
          firstAnswerLength >= 80 && !genericOpening,
          8,
          firstAnswerLength >= 40 ? 4 : 0,
        ) +
          (wordCount >= 900
            ? 6
            : wordCount >= 700
              ? 5
              : wordCount >= 500
                ? 3
                : wordCount >= 300
                  ? 1
                  : 0) +
          this.points(
            (version.excerpt?.length ?? 0) >= 80,
            3,
            version.excerpt ? 1 : 0,
          ) +
          (headings.length >= 3
            ? 3
            : headings.length === 2
              ? 2
              : headings.length === 1
                ? 1
                : 0),
        20,
        'Respuesta temprana, cobertura y utilidad para la consulta.',
        [
          `Respuesta inicial: ${firstAnswerLength} caracteres`,
          genericOpening
            ? 'El inicio utiliza una fórmula genérica'
            : 'El inicio parte de una necesidad concreta',
          `Extensión: ${wordCount} palabras`,
          `Encabezados: ${headings.length}`,
        ],
        {
          firstAnswerLength,
          wordCount,
          headingCount: headings.length,
          genericOpening,
        },
      ),
      this.dimension(
        NoteQaDimension.ORIGINALITY_EVIDENCE,
        (version.sources.length >= 3
          ? 7
          : version.sources.length >= 1
            ? 3
            : 0) +
          this.points(hasPrimarySource, 5, 0) +
          this.points(Boolean(version.authorName && version.authorRole), 4, 0) +
          this.points(hasQuoteOrCallout, 2, 0) +
          this.points(
            version.sources.length > 0 &&
              version.sources.every((source) => source.entity.length >= 2),
            2,
            0,
          ),
        20,
        'Aporte atribuido, fuentes y afirmaciones verificables.',
        [
          `${version.sources.length} fuente(s) registradas`,
          hasPrimarySource
            ? 'Incluye fuente prioritaria'
            : 'Sin fuente primaria o conocimiento Adecco',
          version.authorName ? 'Autoría identificada' : 'Autoría pendiente',
        ],
        { sourceCount: version.sources.length, hasPrimarySource },
      ),
      this.dimension(
        NoteQaDimension.ORGANIZATION_CLARITY,
        (blocks.length >= 8 ? 4 : blocks.length >= 4 ? 2 : 0) +
          (headings.length >= 2 ? 5 : headings.length === 1 ? 3 : 0) +
          this.points(
            textBlocks.some((text) => text.length >= 80) &&
              !severeMechanicalRepetition,
            3,
            0,
          ) +
          this.points(hasList, 3, 0),
        15,
        'Jerarquía, lectura natural y secciones coherentes.',
        [
          `${blocks.length} bloques estructurados`,
          `${headings.length} encabezados`,
          hasList ? 'Incluye lista' : 'No incluye listas',
          severeMechanicalRepetition
            ? 'Se detectó repetición mecánica de oraciones'
            : 'Sin repetición mecánica relevante',
        ],
        {
          blockCount: blocks.length,
          headingCount: headings.length,
          hasList,
          repeatedSentenceCount,
          severeMechanicalRepetition,
        },
      ),
      this.dimension(
        NoteQaDimension.SEO_EDITORIAL,
        this.points(Boolean(version.metaTitle), 4, 0) +
          this.points((version.metaDescription?.length ?? 0) >= 120, 4, 0) +
          this.points(Boolean(version.slug), 3, 0) +
          this.points(internalLinks.length > 0, 2, 0) +
          this.points(
            version.title.length >= 30 && version.title.length <= 100,
            2,
            0,
          ),
        15,
        'Metadatos, encabezados, enlaces e intención editorial.',
        [
          version.metaTitle ? 'Meta title definido' : 'Falta meta title',
          version.metaDescription
            ? 'Meta description definida'
            : 'Falta meta description',
          `${internalLinks.length} enlace(s) interno(s)`,
        ],
        {
          hasMetaTitle: Boolean(version.metaTitle),
          hasMetaDescription: Boolean(version.metaDescription),
          internalLinkCount: internalLinks.length,
        },
      ),
      this.dimension(
        NoteQaDimension.GEO_AEO_CITABILITY,
        (datedSources >= 2 ? 3 : datedSources === 1 ? 1 : 0) +
          this.points(hasPrimarySource, 3, 0) +
          this.points(firstAnswerLength >= 80 && !genericOpening, 3, 0) +
          this.points(Boolean(version.authorName), 2, 0) +
          this.points(hasQuoteOrCallout, 1, 0) +
          (version.sources.length > 0 &&
          citedSourceUrls.length === version.sources.length
            ? 3
            : citedSourceUrls.length > 0
              ? 1
              : 0),
        15,
        'Entidades, contexto, atribución y respuestas directas.',
        [
          `${datedSources} fuente(s) con fecha`,
          `${citedSourceUrls.length} de ${version.sources.length} fuente(s) citadas dentro del contenido`,
          unregisteredExternalUrls.length
            ? `${unregisteredExternalUrls.length} enlace(s) externo(s) sin fuente registrada`
            : 'Los enlaces externos del cuerpo están registrados',
          firstAnswerLength >= 80
            ? 'Respuesta temprana identificada'
            : 'La respuesta inicial necesita desarrollo',
          version.authorName
            ? 'Autoría atribuida'
            : 'Falta atribución de autoría',
        ],
        {
          datedSources,
          firstAnswerLength,
          hasPrimarySource,
          citedSourceCount: citedSourceUrls.length,
          unregisteredExternalUrls,
          trackingUrlCount,
        },
      ),
      this.dimension(
        NoteQaDimension.ACTION_ORIENTATION,
        this.points(
          requiresAdeccoCta ? hasValidCta : Boolean(version.ctaText),
          5,
          0,
        ) +
          this.points(
            requiresAdeccoCta ? hasValidCta : Boolean(version.ctaUrl),
            3,
            0,
          ) +
          this.points(hasList, 2, 0),
        10,
        'CTA útil y proporcional a la intención.',
        [
          requiresAdeccoCta
            ? hasValidCta
              ? 'CTA de contacto con especialista validado'
              : 'El CTA no cumple la regla de contacto de Adecco'
            : version.ctaText
              ? 'CTA definido'
              : 'Falta CTA',
          requiresAdeccoCta
            ? `Destino requerido: ${ADECCO_CONTACT_URL}`
            : version.ctaUrl
              ? 'CTA enlazado'
              : 'Falta enlace del CTA',
        ],
        {
          hasCtaText: Boolean(version.ctaText),
          hasCtaUrl: Boolean(version.ctaUrl),
          requiresAdeccoCta,
          hasValidCta,
        },
      ),
      this.dimension(
        NoteQaDimension.FINAL_QUALITY,
        this.points(!hasPlaceholder, 3, 0) +
          this.points(emptyBlocks === 0, 2, 0),
        5,
        'Ausencia de pendientes y defectos estructurales.',
        [
          hasPlaceholder
            ? 'Se detectaron marcadores pendientes'
            : 'Sin marcadores pendientes',
          emptyBlocks
            ? `${emptyBlocks} bloque(s) vacío(s)`
            : 'Sin bloques vacíos',
        ],
        { hasPlaceholder, emptyBlocks },
      ),
    ];

    const criticalBlockers = [
      ...(requiresAdeccoCta && !hasValidCta
        ? [
            `El CTA de Adecco debe invitar a contactar a un especialista y enlazar a ${ADECCO_CONTACT_URL}.`,
          ]
        : []),
      ...(wordCount < 700
        ? [
            'El contenido tiene menos de 700 palabras útiles y no alcanza la profundidad editorial mínima de este flujo.',
          ]
        : []),
      ...(hasPlaceholder
        ? ['Existen datos pendientes o marcadores de posición.']
        : []),
      ...(severeMechanicalRepetition
        ? [
            'El contenido repite oraciones de forma mecánica y requiere una reescritura humana.',
          ]
        : []),
      ...(normativeClaim &&
      !version.sources.some((source) => source.type === NoteSourceType.PRIMARY)
        ? [
            'Se detectó una afirmación normativa sin fuente primaria registrada.',
          ]
        : []),
      ...(normativeClaim && hasPrimarySource && !normativeClaimCited
        ? [
            'La afirmación normativa no conserva una cita primaria dentro del mismo bloque de contenido.',
          ]
        : []),
      ...(version.sources.length > 0 && citedSourceUrls.length === 0
        ? [
            'Las fuentes están registradas, pero ninguna está citada dentro del contenido.',
          ]
        : []),
      ...(unregisteredExternalUrls.length
        ? [
            'El contenido incluye enlaces externos que no están registrados como fuentes, enlaces internos o CTA.',
          ]
        : []),
      ...(trackingUrlCount
        ? [
            'Se detectaron parámetros de seguimiento en URLs; deben eliminarse antes de compartir o exportar.',
          ]
        : []),
      ...(absolutePromise
        ? [
            'Se detectó una garantía absoluta de resultados o cumplimiento; debe reformularse con alcance, condiciones y evidencia.',
          ]
        : []),
      ...(unsupportedPerformanceClaim
        ? [
            'Se detectó una afirmación de desempeño atribuida a automatización sin fuentes registradas.',
          ]
        : []),
      ...(version.sources.some(
        (source) => source.accessedAt.getTime() > Date.now() + 86_400_000,
      )
        ? ['Una fuente tiene una fecha de consulta futura.']
        : []),
    ];
    const overallScore = dimensions.reduce(
      (total, dimension) => total + dimension.score,
      0,
    );
    const verdict = criticalBlockers.length
      ? EvaluationVerdict.BLOCK
      : overallScore >= 80
        ? EvaluationVerdict.PASS
        : EvaluationVerdict.REVIEW;

    return {
      overallScore,
      verdict,
      criticalBlockers,
      summary:
        verdict === EvaluationVerdict.PASS
          ? 'La versión supera 80 puntos y no presenta bloqueos críticos.'
          : verdict === EvaluationVerdict.BLOCK
            ? 'La versión requiere corregir bloqueos críticos antes de revisión humana.'
            : 'La versión necesita ajustes para alcanzar el umbral de aprobación.',
      dimensions,
    };
  }

  private dimension(
    dimension: NoteQaDimension,
    score: number,
    maxScore: number,
    summary: string,
    findings: string[],
    evidence: Record<string, unknown>,
  ): DimensionResult {
    const ratio = score / maxScore;
    return {
      dimension,
      score,
      maxScore,
      verdict:
        ratio >= 0.8
          ? EvaluationVerdict.PASS
          : ratio < 0.4
            ? EvaluationVerdict.BLOCK
            : EvaluationVerdict.REVIEW,
      summary,
      findings,
      evidence,
    };
  }

  private points(condition: boolean, pass: number, fail: number): number {
    return condition ? pass : fail;
  }

  private extractUrls(value: string): string[] {
    return this.extractRawUrls(value).map((match) =>
      this.normalizeUrl(match.replace(/[),.;:!?]+$/, '')),
    );
  }

  private extractRawUrls(value: string): string[] {
    return value.match(/https?:\/\/[^\s<>{}"']+/gi) ?? [];
  }

  private normalizeUrl(value: string): string {
    return stripTrackingParameters(value).replace(/\/$/, '').toLowerCase();
  }

  private hasTrackingParameter(value: string): boolean {
    try {
      const url = new URL(value);
      return [...url.searchParams.keys()].some((key) =>
        /^(utm_|_ga$|dclid$|fbclid$|gclid$|gbraid$|mc_cid$|mc_eid$|msclkid$|srsltid$|wbraid$)/i.test(
          key,
        ),
      );
    } catch {
      return false;
    }
  }
}
