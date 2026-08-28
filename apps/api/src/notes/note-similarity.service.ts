import { Injectable } from '@nestjs/common';

export type ComparableNote = {
  noteId: string;
  title: string;
  content: unknown;
};

export type NoteSimilarityMatch = {
  noteId: string;
  title: string;
  score: number;
  sharedTerms: string[];
};

const stopWords = new Set(
  'a al algo ante antes como con contra cual cuando de del desde donde dos el ella en entre es esta este esto hacia hasta la las lo los mas mediante muy no o para pero por porque que se sin sobre su sus un una y ya'.split(
    ' ',
  ),
);

const conceptAliases: Record<string, string> = {
  adiestramiento: 'aprendizaje',
  aprendizaje: 'aprendizaje',
  capacitacion: 'aprendizaje',
  entrenamiento: 'aprendizaje',
  formacion: 'aprendizaje',
  colaborador: 'personal',
  colaboradores: 'personal',
  empleado: 'personal',
  empleados: 'personal',
  trabajador: 'personal',
  trabajadores: 'personal',
  nomina: 'planilla',
  payroll: 'planilla',
  reclutamiento: 'seleccion',
  tercerizacion: 'outsourcing',
  externalizacion: 'outsourcing',
};

@Injectable()
export class NoteSimilarityService {
  compare(
    current: Pick<ComparableNote, 'title' | 'content'>,
    candidates: ComparableNote[],
  ): NoteSimilarityMatch | null {
    const currentVector = this.vectorize(current);
    if (!currentVector.tokens.length) return null;

    const matches = candidates
      .map((candidate) => {
        const candidateVector = this.vectorize(candidate);
        const cosine = this.cosine(
          currentVector.frequencies,
          candidateVector.frequencies,
        );
        const conceptOverlap = this.overlapCoefficient(
          currentVector.concepts,
          candidateVector.concepts,
        );
        const phraseOverlap = this.jaccard(
          currentVector.bigrams,
          candidateVector.bigrams,
        );
        const score = Math.round(
          Math.min(
            1,
            cosine * 0.45 + conceptOverlap * 0.35 + phraseOverlap * 0.2,
          ) * 100,
        );
        const sharedTerms = [...currentVector.concepts]
          .filter((term) => candidateVector.concepts.has(term))
          .sort((a, b) => a.localeCompare(b, 'es'))
          .slice(0, 10);
        return {
          noteId: candidate.noteId,
          title: candidate.title,
          score,
          sharedTerms,
        };
      })
      .sort(
        (a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'),
      );

    return matches[0] ?? null;
  }

  private vectorize(value: Pick<ComparableNote, 'title' | 'content'>) {
    const rawText = `${value.title} ${this.extractText(value.content)}`;
    const tokens = this.normalize(rawText);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return {
      tokens,
      frequencies,
      concepts: new Set(tokens),
      bigrams: new Set(
        tokens.slice(1).map((token, index) => `${tokens[index]} ${token}`),
      ),
    };
  }

  private extractText(content: unknown): string {
    if (!content || typeof content !== 'object') return '';
    const blocks = Array.isArray((content as { blocks?: unknown }).blocks)
      ? ((content as { blocks: unknown[] }).blocks ?? [])
      : [];
    return blocks
      .flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const block = value as Record<string, unknown>;
        if (Array.isArray(block.items)) {
          return block.items.filter(
            (item): item is string => typeof item === 'string',
          );
        }
        return typeof block.text === 'string' ? [block.text] : [];
      })
      .join(' ');
  }

  private normalize(value: string): string[] {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token))
      .map((token) => conceptAliases[token] ?? this.stem(token));
  }

  private stem(token: string): string {
    return token
      .replace(/(?:amientos|imientos|aciones|uciones)$/u, '')
      .replace(/(?:amiento|imiento|acion|ucion)$/u, '')
      .replace(/(?:idades|idad|mente)$/u, '')
      .replace(/([aeiou])s$/u, '$1')
      .replace(/es$/u, '')
      .replace(/s$/u, '');
  }

  private cosine(
    left: Map<string, number>,
    right: Map<string, number>,
  ): number {
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (const [term, count] of left) {
      dot += count * (right.get(term) ?? 0);
      leftMagnitude += count * count;
    }
    for (const count of right.values()) rightMagnitude += count * count;
    if (!leftMagnitude || !rightMagnitude) return 0;
    return dot / Math.sqrt(leftMagnitude * rightMagnitude);
  }

  private overlapCoefficient(left: Set<string>, right: Set<string>): number {
    const denominator = Math.min(left.size, right.size);
    if (!denominator) return 0;
    return [...left].filter((term) => right.has(term)).length / denominator;
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    const intersection = [...left].filter((term) => right.has(term)).length;
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }
}
