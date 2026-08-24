import { EvaluationVerdict, NoteSourceType } from '../generated/prisma/client';
import { NoteContentService } from './note-content.service';
import { NoteQaRulesService } from './note-qa-rules.service';

type QaInput = Parameters<NoteQaRulesService['evaluate']>[0];

describe('NoteQaRulesService', () => {
  const service = new NoteQaRulesService(new NoteContentService());

  it('aprueba una versión completa con fuentes y trazabilidad', () => {
    const result = service.evaluate(completeVersion());
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(result.criticalBlockers).toEqual([]);
    expect(result.verdict).toBe(EvaluationVerdict.PASS);
    expect(result.dimensions).toHaveLength(7);
    expect(
      result.dimensions.reduce(
        (total, dimension) => total + dimension.maxScore,
        0,
      ),
    ).toBe(100);
  });

  it('bloquea una afirmación normativa sin fuente primaria', () => {
    const version = completeVersion();
    version.sources = version.sources.filter(
      (source) => source.type !== NoteSourceType.PRIMARY,
    );
    version.content = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'intro',
          type: 'paragraph',
          text: `La norma establece un requisito obligatorio. ${'Contenido verificable '.repeat(60)}`,
        },
      ],
    };
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'Se detectó una afirmación normativa sin fuente primaria registrada.',
    );
  });

  it('bloquea marcadores pendientes aunque el contenido sea extenso', () => {
    const version = completeVersion();
    version.metaDescription =
      'Pendiente confirmar este metadato antes de publicar el contenido.';
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'Existen datos pendientes o marcadores de posición.',
    );
  });

  it('bloquea una nota inflada mediante repetición mecánica', () => {
    const version = completeVersion();
    const repeated =
      'La gestión ordenada permite anticipar riesgos y tomar decisiones con responsables del negocio.';
    version.content = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'intro',
          type: 'paragraph',
          text: Array.from({ length: 12 }, () => repeated).join(' '),
        },
      ],
    };
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'El contenido repite oraciones de forma mecánica y requiere una reescritura humana.',
    );
  });

  it('bloquea una nota demasiado corta para el contrato editorial', () => {
    const version = completeVersion();
    version.content = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'intro',
          type: 'paragraph',
          text: 'Una respuesta breve puede ser correcta, pero todavía no desarrolla criterios, evidencia, ejemplos ni una orientación suficiente para esta nota.',
        },
      ],
    };
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'El contenido tiene menos de 700 palabras útiles y no alcanza la profundidad editorial mínima de este flujo.',
    );
  });

  it('bloquea garantías absolutas aunque exista una fuente primaria', () => {
    const version = completeVersion();
    const content = version.content as {
      blocks: Array<Record<string, unknown>>;
    };
    content.blocks.push({
      id: 'absolute-promise',
      type: 'paragraph',
      text: 'Este servicio ofrece cumplimiento legal garantizado para cualquier organización.',
    });
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'Se detectó una garantía absoluta de resultados o cumplimiento; debe reformularse con alcance, condiciones y evidencia.',
    );
  });

  it('bloquea afirmaciones de desempeño de IA cuando no hay fuentes', () => {
    const version = completeVersion();
    version.sources = [];
    const content = version.content as {
      blocks: Array<Record<string, unknown>>;
    };
    content.blocks.push({
      id: 'unsupported-ai-performance',
      type: 'paragraph',
      text: 'La inteligencia artificial predice el desempeño de cada candidato.',
    });
    const result = service.evaluate(version);
    expect(result.verdict).toBe(EvaluationVerdict.BLOCK);
    expect(result.criticalBlockers).toContain(
      'Se detectó una afirmación de desempeño atribuida a automatización sin fuentes registradas.',
    );
  });

  it('bloquea fuentes registradas que no están citadas en el contenido', () => {
    const version = completeVersion();
    const content = version.content as {
      blocks: Array<Record<string, unknown>>;
    };
    content.blocks = content.blocks.map((block) => ({
      ...block,
      ...(typeof block.text === 'string'
        ? { text: block.text.replace(/https?:\/\/\S+/g, '') }
        : {}),
    }));

    const result = service.evaluate(version);

    expect(result.criticalBlockers).toContain(
      'Las fuentes están registradas, pero ninguna está citada dentro del contenido.',
    );
  });

  it('bloquea enlaces externos no registrados y parámetros de seguimiento', () => {
    const version = completeVersion();
    const content = version.content as {
      blocks: Array<Record<string, unknown>>;
    };
    content.blocks.push({
      id: 'orphan-link',
      type: 'paragraph',
      text: 'Referencia sin registrar: https://example.com/reporte?utm_source=openai',
    });

    const result = service.evaluate(version);

    expect(result.criticalBlockers).toEqual(
      expect.arrayContaining([
        'El contenido incluye enlaces externos que no están registrados como fuentes, enlaces internos o CTA.',
        'Se detectaron parámetros de seguimiento en URLs; deben eliminarse antes de compartir o exportar.',
      ]),
    );
  });

  function completeVersion(): QaInput {
    const paragraphs = [
      'Cuando una posición clave queda vacante, el problema no empieza con la búsqueda de reemplazo: empieza cuando nadie sabe qué decisiones, relaciones o conocimientos dependen de ella. Un mapa de puestos críticos permite reconocer ese riesgo antes de que afecte la operación y convierte una preocupación difusa en prioridades concretas para talento y negocio.',
      'Un puesto crítico no siempre es el de mayor jerarquía. Puede ser una función técnica difícil de sustituir, un rol que conecta equipos o una posición cuya ausencia interrumpe un proceso esencial. Por eso, el análisis debe mirar el impacto operativo, la disponibilidad de capacidades y el tiempo real que tomaría recuperar el desempeño esperado.',
      'El primer paso consiste en acordar criterios comunes con quienes conocen la operación. Recursos Humanos puede facilitar el proceso, pero los responsables de cada área deben explicar qué entregables dependen del puesto, qué decisiones no pueden postergarse y qué conocimiento está concentrado. Esa conversación evita que el mapa se reduzca a una lista basada solo en organigramas.',
      'Después conviene valorar cada posición con una escala sencilla y documentada. El equipo puede comparar impacto, escasez, tiempo de reemplazo y nivel de dependencia. Lo importante no es producir una cifra perfecta, sino dejar evidencia suficiente para entender por qué una posición requiere una medida preventiva y otra puede gestionarse mediante el proceso habitual de selección.',
      'La priorización debe traducirse en acciones distintas. Algunos puestos necesitarán planes de sucesión; otros, documentación de procesos, formación cruzada o construcción anticipada de una cantera. Asignar un responsable y una fecha de revisión ayuda a que el ejercicio no quede archivado y permite observar si el riesgo disminuye con el tiempo.',
      'El mapa también necesita mantenimiento. Una nueva tecnología, una reorganización o el crecimiento de una línea de negocio pueden cambiar la importancia de una función. Revisar los criterios con una frecuencia definida y después de cambios relevantes mantiene el análisis conectado con la estrategia, en lugar de conservar una fotografía que pronto deja de representar la realidad.',
      'El resultado más útil es una conversación mejor informada. Con prioridades visibles, la organización puede decidir dónde invertir en desarrollo, qué búsquedas preparar con anticipación y qué conocimiento debe distribuir. Así, el mapeo deja de ser un inventario de cargos y se convierte en una herramienta práctica para proteger la continuidad sin sobredimensionar cada vacante.',
      'Por ejemplo, una empresa puede descubrir que el responsable de coordinar un turno no parece crítico por jerarquía, pero concentra la relación con proveedores, la programación diaria y la respuesta ante incidentes. La medida inmediata no tendría que ser contratar un reemplazo: podría comenzar por documentar decisiones, formar a una segunda persona y probar la continuidad durante una ausencia planificada.',
      'También conviene distinguir criticidad de desempeño. Una persona con resultados sobresalientes puede ocupar un puesto fácil de cubrir, mientras una función menos visible puede requerir meses de aprendizaje. Mezclar ambos conceptos produce prioridades equivocadas y dificulta explicar por qué se asignan recursos a determinadas posiciones. La evaluación debe observar el puesto y luego definir cómo reducir su dependencia.',
      'Antes de cerrar el ejercicio, el equipo puede revisar si cada prioridad tiene evidencia, un responsable y una acción proporcional. Esa revisión ayuda a detectar sesgos, evita declarar que todos los cargos son críticos y deja una base comprensible para actualizar el mapa. La calidad del proceso depende menos de una matriz compleja que de decisiones documentadas y revisables.',
      'La gobernanza puede mantenerse ligera. Una reunión trimestral con talento y responsables de operación suele ser más útil que una evaluación extensa que nadie actualiza. En esa conversación se revisan cambios de estructura, nuevas capacidades, rotación y medidas pendientes. Si una posición deja de ser crítica, el equipo debe registrar qué acción redujo la dependencia en lugar de conservarla por inercia.',
      'Para observar avances conviene elegir indicadores conectados con el riesgo. El porcentaje de procesos documentados, la cobertura de sucesores o el tiempo estimado para recuperar una capacidad pueden ofrecer señales prácticas. Ningún indicador demuestra por sí solo la continuidad; su función es facilitar preguntas y mostrar dónde una medida necesita seguimiento o una decisión adicional.',
      'El mapeo también puede orientar búsquedas futuras. Si una capacidad es escasa y el tiempo de reemplazo es alto, la organización puede preparar perfiles, fuentes de talento y criterios de evaluación antes de una vacante. Esa preparación no significa abrir procesos innecesarios, sino reducir improvisación y conservar información suficiente para actuar con rapidez cuando exista una necesidad aprobada.',
      'Comunicar el propósito evita interpretaciones equivocadas. El ejercicio no debe presentarse como una clasificación del valor de las personas ni como una señal de reemplazo. Explicar que se evalúa la dependencia de funciones y procesos permite obtener mejor información de los equipos y disminuye la tendencia a proteger cada puesto mediante una puntuación artificialmente alta.',
      'Entre los errores frecuentes están copiar criterios de otra empresa, valorar solo la jerarquía, confundir urgencia con criticidad y aprobar acciones sin responsable. También es riesgoso usar una cifra como respuesta automática. La matriz ayuda a ordenar la conversación, pero la decisión final debe conservar contexto, evidencia y revisión de quienes conocen el impacto real en la operación.',
    ];
    const now = new Date('2026-08-16T10:00:00.000Z');
    return {
      title:
        'Mapeo de puestos críticos para fortalecer la continuidad del negocio',
      metaTitle: 'Mapeo de puestos críticos y continuidad del negocio | Adecco',
      metaDescription:
        'Conoce cómo identificar puestos críticos, priorizar capacidades y diseñar acciones que fortalezcan la continuidad operativa de tu organización.',
      slug: 'mapeo-puestos-criticos-continuidad-negocio',
      excerpt:
        'Una guía práctica para identificar posiciones esenciales, evaluar riesgos y organizar decisiones de talento con evidencia verificable.',
      content: {
        schemaVersion: 1,
        blocks: [
          { id: 'intro', type: 'paragraph', text: paragraphs[0] },
          {
            id: 'h2-1',
            type: 'heading',
            level: 2,
            text: 'Qué es un puesto crítico',
          },
          { id: 'p-1', type: 'paragraph', text: paragraphs[1] },
          {
            id: 'list-1',
            type: 'bullet_list',
            items: [
              'Impacto operativo',
              'Escasez de capacidades',
              'Tiempo de reemplazo',
            ],
          },
          {
            id: 'h2-2',
            type: 'heading',
            level: 2,
            text: 'Cómo realizar el mapeo',
          },
          {
            id: 'p-2',
            type: 'paragraph',
            text: `${paragraphs[2]} Fuente institucional: https://www.gob.pe/mtpe`,
          },
          {
            id: 'callout-1',
            type: 'callout',
            text: 'Adecco recomienda revisar el mapa con responsables de negocio y talento.',
          },
          {
            id: 'p-3',
            type: 'paragraph',
            text: `${paragraphs[3]} Referencia Adecco: https://www.adecco.com/es-pe`,
          },
          { id: 'p-4', type: 'paragraph', text: paragraphs[4] },
          {
            id: 'p-5',
            type: 'paragraph',
            text: `${paragraphs[5]} Contexto internacional: https://www.ilo.org/`,
          },
          {
            id: 'h2-3',
            type: 'heading',
            level: 2,
            text: 'Cómo convertir el análisis en decisiones',
          },
          { id: 'p-6', type: 'paragraph', text: paragraphs[7] },
          { id: 'p-7', type: 'paragraph', text: paragraphs[8] },
          { id: 'p-8', type: 'paragraph', text: paragraphs[9] },
          { id: 'p-9', type: 'paragraph', text: paragraphs[10] },
          { id: 'p-10', type: 'paragraph', text: paragraphs[11] },
          { id: 'p-11', type: 'paragraph', text: paragraphs[12] },
          { id: 'p-12', type: 'paragraph', text: paragraphs[13] },
          { id: 'p-13', type: 'paragraph', text: paragraphs[14] },
          { id: 'p-14', type: 'paragraph', text: paragraphs[6] },
        ],
      },
      authorName: 'Especialista de Adecco Perú',
      authorRole: 'Consultoría de talento',
      ctaText:
        'Conversa con Adecco para evaluar los puestos críticos de tu organización.',
      ctaUrl: 'https://www.adecco.com/es-pe/empresas',
      internalLinks: ['https://www.adecco.com/es-pe/blog'],
      sources: [
        source(
          NoteSourceType.PRIMARY,
          'Ministerio de Trabajo',
          'https://www.gob.pe/mtpe',
          now,
        ),
        source(
          NoteSourceType.ADECCO_KNOWLEDGE,
          'Adecco Perú',
          'https://www.adecco.com/es-pe',
          now,
        ),
        source(
          NoteSourceType.RECOGNIZED_SECONDARY,
          'OIT',
          'https://www.ilo.org/',
          now,
        ),
      ],
    };
  }

  function source(
    type: NoteSourceType,
    entity: string,
    url: string,
    accessedAt: Date,
  ): QaInput['sources'][number] {
    return {
      id: `${type}-source`,
      noteVersionId: '00000000-0000-0000-0000-000000000001',
      type,
      title: `Fuente ${entity}`,
      entity,
      url,
      publishedAt: new Date('2026-01-15T00:00:00.000Z'),
      accessedAt,
    };
  }
});
