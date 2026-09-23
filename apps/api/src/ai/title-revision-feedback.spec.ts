import {
  latestTitleRevisionFeedback,
  loadLatestTitleRevisionFeedback,
} from './ai-generation.service';

describe('latestTitleRevisionFeedback', () => {
  it('usa la observación interna más reciente aunque no exista un enlace externo', () => {
    const latest = latestTitleRevisionFeedback([
      {
        proposalId: 'title-a',
        type: 'REQUEST_CHANGES',
        reason: 'Observación externa anterior.',
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
      },
      {
        proposalId: 'title-a',
        type: 'REQUEST_CHANGES',
        reason: 'Usar el título solicitado dentro del software.',
        createdAt: new Date('2026-09-23T01:34:11.473Z'),
      },
    ]);

    expect(latest.get('title-a')).toMatchObject({
      reason: 'Usar el título solicitado dentro del software.',
      type: 'REQUEST_CHANGES',
    });
  });

  it('consulta las decisiones internas cuando el paquete no tiene revisión externa', async () => {
    const titlePackageReviewDecision = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const titleDecision = {
      findMany: jest.fn().mockResolvedValue([
        {
          proposalId: 'title-internal',
          type: 'REQUEST_CHANGES',
          reason: 'Reemplazar el título por la alternativa solicitada.',
          createdAt: new Date('2026-09-23T01:34:11.473Z'),
        },
      ]),
    };

    const latest = await loadLatestTitleRevisionFeedback(
      { titlePackageReviewDecision, titleDecision } as never,
      ['title-internal'],
    );

    expect(titlePackageReviewDecision.findMany).toHaveBeenCalledTimes(1);
    expect(titleDecision.findMany).toHaveBeenCalledTimes(1);
    expect(latest.get('title-internal')).toMatchObject({
      type: 'REQUEST_CHANGES',
      reason: 'Reemplazar el título por la alternativa solicitada.',
    });
  });
});
