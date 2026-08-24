import {
  finalizeTitleBriefSuggestion,
  noteDraftSchema,
  titleBriefSnapshotSchema,
  titleGenerationSnapshotSchema,
  titleJudgeSchema,
} from './ai-generation.schemas';

describe('esquemas de generación inteligente', () => {
  it('impide que el juez entregue menos de tres títulos', () => {
    expect(() =>
      titleJudgeSchema.parse({
        summary: 'Revisión final con evidencia editorial suficiente.',
        candidates: [],
        discarded: [],
      }),
    ).toThrow();
  });

  it('valida el snapshot reproducible de títulos', () => {
    expect(
      titleGenerationSnapshotSchema.parse({
        request: {
          topic: 'Retención de talento',
          objective: 'Orientar decisiones responsables de recursos humanos.',
          audience: 'Gerencias de Recursos Humanos',
          searchIntent: 'Resolver',
          campaignYear: 2026,
          campaignMonth: 8,
          count: 5,
          additionalContext: null,
        },
        client: {
          id: '853156a8-f876-46d0-9b5e-8b84ad629340',
          name: 'Adecco Perú',
          slug: 'adecco-peru',
        },
        history: [],
        activeRules: [],
        corrections: [],
      }).request.count,
    ).toBe(5);
  });

  it('solo acepta paquetes de cuatro, cinco u ocho títulos', () => {
    const base = {
      request: {
        topic: 'Retención de talento',
        objective: 'Orientar decisiones responsables de recursos humanos.',
        audience: 'Gerencias de Recursos Humanos',
        searchIntent: 'Resolver',
        campaignYear: 2026,
        campaignMonth: 8,
        additionalContext: null,
      },
      client: {
        id: '853156a8-f876-46d0-9b5e-8b84ad629340',
        name: 'Adecco Perú',
        slug: 'adecco-peru',
      },
      history: [],
      activeRules: [],
      corrections: [],
    };
    expect(
      [4, 5, 8].every(
        (count) =>
          titleGenerationSnapshotSchema.safeParse({
            ...base,
            request: { ...base.request, count },
          }).success,
      ),
    ).toBe(true);
    expect(
      titleGenerationSnapshotSchema.safeParse({
        ...base,
        request: { ...base.request, count: 3 },
      }).success,
    ).toBe(false);
  });

  it('conserva la intención humana y elimina fragmentos incompletos del encargo', () => {
    const suggestion = finalizeTitleBriefSuggestion(
      {
        summary: 'Encargo editorial diferenciado y listo para revisión.',
        topic: 'Facility Management para operaciones con varias sedes',
        objective:
          'Ayudar a comparar alternativas con criterios operativos verificables.',
        audience: 'Gerencias de Operaciones y Recursos Humanos',
        searchIntent: 'Resolver',
        additionalContext:
          'Explicar el alcance y las responsabilidades de cada alternativa. Incluir criterios de supervisión y continuidad operativa. Propuesta visual, su',
        differentiation:
          'Evitar una lista comercial genérica. Priorizar la decisión de diseño y control operativo. La evidencia requerida debe provenir,,',
      },
      'Comparar',
    );

    expect(suggestion.searchIntent).toBe('Comparar');
    expect(suggestion.additionalContext).toBe(
      'Explicar el alcance y las responsabilidades de cada alternativa. Incluir criterios de supervisión y continuidad operativa.',
    );
    expect(suggestion.differentiation).toBe(
      'Evitar una lista comercial genérica. Priorizar la decisión de diseño y control operativo.',
    );
  });

  it('exige la intención humana en el snapshot del encargo', () => {
    const base = {
      request: {
        campaignYear: 2026,
        campaignMonth: 8,
        searchIntent: 'Decidir',
      },
      client: {
        id: '853156a8-f876-46d0-9b5e-8b84ad629340',
        name: 'Adecco Perú',
        slug: 'adecco-peru',
      },
      history: [],
      activeRules: [],
      corrections: [],
    };

    expect(titleBriefSnapshotSchema.safeParse(base).success).toBe(true);
    expect(
      titleBriefSnapshotSchema.safeParse({
        ...base,
        request: { campaignYear: 2026, campaignMonth: 8 },
      }).success,
    ).toBe(false);
  });

  it('acepta fuentes HTTPS y rechaza protocolos no permitidos en una nota', () => {
    const draft = {
      summary:
        'Borrador completo respaldado por una investigación verificable.',
      title: 'Cómo acompañar al talento durante un cambio organizacional',
      metaTitle: 'Acompañamiento del talento durante cambios organizacionales',
      metaDescription:
        'Conoce acciones concretas para acompañar al talento y cuidar su permanencia durante un proceso de cambio organizacional.',
      slug: 'acompanar-talento-cambio-organizacional',
      excerpt:
        'Una guía práctica para responsables de recursos humanos que acompañan procesos de cambio.',
      authorName: 'Equipo editorial',
      authorRole: 'Especialistas en talento',
      ctaText: 'Conoce cómo podemos acompañar a tu organización.',
      imageProposal: null,
      content: {
        schemaVersion: 1,
        blocks: Array.from({ length: 8 }, (_, index) => ({
          id: `p-${index + 1}`,
          type: 'paragraph',
          text: `Contenido verificable del bloque editorial número ${index + 1}.`,
        })),
      },
      sourceUrlsUsed: ['https://www.ilo.org/example'],
    };
    expect(noteDraftSchema.safeParse(draft).success).toBe(true);
    const draftWithoutImageProposal = Object.fromEntries(
      Object.entries(draft).filter(([key]) => key !== 'imageProposal'),
    );
    expect(noteDraftSchema.safeParse(draftWithoutImageProposal).success).toBe(
      false,
    );
    expect(
      noteDraftSchema.safeParse({
        ...draft,
        sourceUrlsUsed: ['ftp://example.com'],
      }).success,
    ).toBe(false);
  });
});
