import { NoteSimilarityService } from './note-similarity.service';

describe('NoteSimilarityService', () => {
  const service = new NoteSimilarityService();

  it('marca con alta similitud una versión textual equivalente', () => {
    const content = {
      blocks: [
        {
          text: 'La capacitación del personal permite cerrar brechas de desempeño con criterios observables.',
        },
      ],
    };
    const match = service.compare(
      { title: 'Capacitación basada en competencias', content },
      [
        {
          noteId: 'note-1',
          title: 'Capacitación basada en competencias',
          content,
        },
      ],
    );

    expect(match?.noteId).toBe('note-1');
    expect(match?.score).toBe(100);
  });

  it('reconoce conceptos equivalentes aunque cambie el vocabulario', () => {
    const match = service.compare(
      {
        title: 'Formación del colaborador para cerrar brechas',
        content: {
          blocks: [
            {
              text: 'El entrenamiento debe responder al desempeño observable del trabajador.',
            },
          ],
        },
      },
      [
        {
          noteId: 'note-2',
          title: 'Capacitación del personal y brechas de desempeño',
          content: {
            blocks: [
              {
                text: 'El aprendizaje se planifica con evidencias observables de cada empleado.',
              },
            ],
          },
        },
      ],
    );

    expect(match?.score).toBeGreaterThanOrEqual(58);
    expect(match?.sharedTerms).toEqual(
      expect.arrayContaining(['aprendizaje', 'personal']),
    );
  });

  it('mantiene baja la similitud de temas distintos', () => {
    const match = service.compare(
      {
        title: 'Conciliación de planilla mensual',
        content: {
          blocks: [{ text: 'Revisa descuentos y novedades antes del cierre.' }],
        },
      },
      [
        {
          noteId: 'note-3',
          title: 'Selección de talento para operaciones mineras',
          content: {
            blocks: [
              { text: 'Define competencias y entrevistas para contratar.' },
            ],
          },
        },
      ],
    );

    expect(match?.score).toBeLessThan(30);
  });
});
