import { Injectable } from '@nestjs/common';
import { EvaluationVerdict } from '../generated/prisma/client';
import type {
  ComparableTitle,
  DuplicateEvaluation,
  EvaluationTitle,
} from './title-evaluation.types';

const stopWords = new Set([
  'a',
  'al',
  'como',
  'con',
  'de',
  'del',
  'el',
  'en',
  'es',
  'la',
  'las',
  'lo',
  'los',
  'para',
  'por',
  'que',
  'se',
  'sin',
  'su',
  'sus',
  'un',
  'una',
  'y',
]);

@Injectable()
export class TitleSimilarityService {
  evaluate(
    proposal: EvaluationTitle,
    candidates: ComparableTitle[],
  ): DuplicateEvaluation {
    const compared = candidates.map((candidate) => ({
      candidate,
      ...this.compare(proposal, candidate),
    }));
    const best = compared.toSorted(
      (left, right) => right.score - left.score,
    )[0];
    const score = best?.score ?? 0;
    const verdict =
      score >= 75
        ? EvaluationVerdict.BLOCK
        : score >= 40
          ? EvaluationVerdict.REVIEW
          : EvaluationVerdict.PASS;
    const findings = [
      `${candidates.length} título(s) del cliente comparados`,
      score >= 75
        ? 'Coincidencia alta: requiere una decisión humana'
        : score >= 40
          ? 'Coincidencia media: conviene revisar el enfoque'
          : 'Sin coincidencias textuales relevantes',
    ];

    return {
      score,
      verdict,
      summary: best
        ? `La coincidencia textual más cercana es “${best.candidate.title}” con ${score}/100.`
        : 'No existen otros títulos del cliente para comparar.',
      findings,
      evidence: {
        algorithm: 'title-similarity-v1',
        method: 'tokens-jaccard+containment+character-trigrams+context',
        comparedCount: candidates.length,
        blockingThreshold: 75,
        ...(best
          ? {
              match: {
                proposalId: best.candidate.id,
                title: best.candidate.title,
                status: best.candidate.status,
                createdAt: best.candidate.createdAt.toISOString(),
              },
              factors: best.factors,
            }
          : {}),
      },
      related: best?.candidate,
    };
  }

  private compare(proposal: EvaluationTitle, candidate: ComparableTitle) {
    const leftTitle = this.canonicalize(proposal.title);
    const rightTitle = this.canonicalize(candidate.title);
    if (leftTitle === rightTitle) {
      return {
        score: 100,
        factors: {
          exact: true,
          tokenJaccard: 100,
          tokenContainment: 100,
          characterTrigrams: 100,
          context: 100,
        },
      };
    }

    const leftTokens = this.tokens(leftTitle);
    const rightTokens = this.tokens(rightTitle);
    const tokenJaccard = this.jaccard(leftTokens, rightTokens);
    const tokenContainment = this.containment(leftTokens, rightTokens);
    const characterTrigrams = this.dice(
      this.ngrams(leftTitle.replaceAll(' ', ''), 3),
      this.ngrams(rightTitle.replaceAll(' ', ''), 3),
    );
    const context = this.jaccard(
      this.tokens(`${proposal.focus} ${proposal.searchIntent}`),
      this.tokens(`${candidate.focus} ${candidate.searchIntent}`),
    );
    const weighted =
      tokenJaccard * 0.4 +
      tokenContainment * 0.25 +
      characterTrigrams * 0.25 +
      context * 0.1;

    return {
      score: Math.round(weighted * 100),
      factors: {
        exact: false,
        tokenJaccard: Math.round(tokenJaccard * 100),
        tokenContainment: Math.round(tokenContainment * 100),
        characterTrigrams: Math.round(characterTrigrams * 100),
        context: Math.round(context * 100),
      },
    };
  }

  private canonicalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokens(value: string): Set<string> {
    return new Set(
      this.canonicalize(value)
        .split(' ')
        .filter((token) => token.length > 2 && !stopWords.has(token)),
    );
  }

  private ngrams(value: string, size: number): Set<string> {
    if (value.length <= size) return new Set(value ? [value] : []);
    const grams = new Set<string>();
    for (let index = 0; index <= value.length - size; index += 1) {
      grams.add(value.slice(index, index + size));
    }
    return grams;
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    if (!left.size && !right.size) return 1;
    const intersection = [...left].filter((value) => right.has(value)).length;
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }

  private containment(left: Set<string>, right: Set<string>): number {
    if (!left.size || !right.size) return 0;
    const intersection = [...left].filter((value) => right.has(value)).length;
    return intersection / Math.min(left.size, right.size);
  }

  private dice(left: Set<string>, right: Set<string>): number {
    if (!left.size && !right.size) return 1;
    const intersection = [...left].filter((value) => right.has(value)).length;
    return (2 * intersection) / (left.size + right.size || 1);
  }
}
