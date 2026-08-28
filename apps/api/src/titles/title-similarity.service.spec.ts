import { EvaluationVerdict } from '../generated/prisma/client';
import type {
  ComparableTitle,
  EvaluationTitle,
} from './title-evaluation.types';
import { TitleSimilarityService } from './title-similarity.service';

describe('TitleSimilarityService', () => {
  const service = new TitleSimilarityService();
  const proposal: EvaluationTitle = {
    id: 'proposal-1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    title: 'Cómo identificar puestos críticos para la continuidad del negocio',
    canonicalTitle:
      'como identificar puestos criticos para la continuidad del negocio',
    service: 'Training & Consulting',
    objective: 'Orientar la identificación de posiciones críticas.',
    audience: 'Líderes de recursos humanos',
    searchIntent: 'Aprender a identificar puestos críticos',
    focus: 'puestos críticos y continuidad del negocio',
    opportunity: 'Resolver una necesidad de planificación.',
    risk: 'Evitar afirmaciones normativas.',
    currentVersion: 1,
  };

  it('detecta como bloqueo un título canónicamente idéntico', () => {
    const candidate: ComparableTitle = {
      id: 'proposal-2',
      title:
        'Como identificar puestos críticos para la continuidad del negocio',
      canonicalTitle:
        'como identificar puestos criticos para la continuidad del negocio',
      searchIntent: proposal.searchIntent,
      focus: proposal.focus,
      status: 'USED',
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
    };

    const result = service.evaluate(proposal, [candidate]);

    expect(result.score).toBe(100);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.related?.id).toBe(candidate.id);
  });

  it('marca como única una propuesta sin relación textual', () => {
    const candidate: ComparableTitle = {
      id: 'proposal-3',
      title: 'Beneficios del trabajo híbrido para equipos comerciales',
      canonicalTitle: 'beneficios del trabajo hibrido para equipos comerciales',
      searchIntent: 'Comparar modalidades de trabajo',
      focus: 'trabajo híbrido y ventas',
      status: 'APPROVED',
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
    };

    const result = service.evaluate(proposal, [candidate]);

    expect(result.score).toBeLessThan(40);
    expect(result.verdict).toBe(EvaluationVerdict.PASS);
  });
});
