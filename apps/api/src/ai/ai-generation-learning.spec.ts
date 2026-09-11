import { buildNoteLearningCorrections } from './ai-generation.service';

describe('aprendizaje aplicado a la generación de notas', () => {
  it('combina observaciones recientes del cliente con correcciones versionadas', () => {
    const corrections = buildNoteLearningCorrections(
      [
        {
          field: 'client.note_feedback',
          afterValue: 'Mantener el nombre oficial del servicio.',
          reason: 'No abreviar el nombre del servicio.',
          correctionType: 'OTHER',
          createdAt: new Date('2026-09-10T15:00:00.000Z'),
        },
        {
          field: 'client.note_feedback',
          afterValue: 'Cerrar con un CTA prudente.',
          reason: null,
          correctionType: 'OTHER',
          createdAt: new Date('2026-09-09T15:00:00.000Z'),
        },
      ],
      [
        {
          title: 'Versión observada',
          correctionType: 'OTHER',
          changeReason: 'Corregir una afirmación absoluta.',
          createdAt: new Date('2026-09-08T15:00:00.000Z'),
        },
        {
          title: 'Versión sin correcciones',
          correctionType: null,
          changeReason: null,
          createdAt: new Date('2026-09-07T15:00:00.000Z'),
        },
      ],
    );

    expect(corrections).toEqual([
      expect.objectContaining({
        title: 'Aprendizaje editorial: client.note_feedback',
        changeReason: 'No abreviar el nombre del servicio.',
      }),
      expect.objectContaining({
        changeReason: 'Cerrar con un CTA prudente.',
      }),
      expect.objectContaining({
        title: 'Versión observada',
        changeReason: 'Corregir una afirmación absoluta.',
      }),
    ]);
  });
});
