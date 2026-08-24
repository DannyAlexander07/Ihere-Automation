import {
  stripTrackedUrlsFromText,
  stripTrackedUrlsFromValue,
  stripTrackingParameters,
} from './url-hygiene';

describe('url hygiene', () => {
  it('elimina parámetros de seguimiento y conserva parámetros editoriales', () => {
    expect(
      stripTrackingParameters(
        'https://example.com/norma?articulo=1&utm_source=openai&utm_medium=referral#alcance',
      ),
    ).toBe('https://example.com/norma?articulo=1#alcance');
  });

  it('limpia URLs dentro de prosa sin perder la puntuación', () => {
    expect(
      stripTrackedUrlsFromText(
        'Fuente: https://example.com/reporte?utm_source=openai. Consulta el alcance.',
      ),
    ).toBe('Fuente: https://example.com/reporte. Consulta el alcance.');
  });

  it('limpia estructuras editoriales anidadas', () => {
    expect(
      stripTrackedUrlsFromValue({
        content: [
          { text: 'Ver https://example.com/a?gclid=123&utm_campaign=x' },
        ],
        sourceUrlsUsed: ['https://example.com/a?gclid=123&utm_campaign=x'],
      }),
    ).toEqual({
      content: [{ text: 'Ver https://example.com/a' }],
      sourceUrlsUsed: ['https://example.com/a'],
    });
  });

  it('conserva fechas mientras limpia objetos editoriales planos', () => {
    const accessedAt = new Date('2026-08-20T10:00:00.000Z');
    const result = stripTrackedUrlsFromValue({
      accessedAt,
      source: {
        url: 'https://example.com/report?utm_source=openai&year=2026',
      },
    });

    expect(result.accessedAt).toBe(accessedAt);
    expect(result.source.url).toBe('https://example.com/report?year=2026');
  });

  it('limpia instancias de DTO sin convertir sus fechas', () => {
    class EditorialDto {
      accessedAt = new Date('2026-08-20T10:00:00.000Z');
      url = 'https://example.com/report?utm_source=openai';
    }

    const result = stripTrackedUrlsFromValue(new EditorialDto());

    expect(result.accessedAt).toBeInstanceOf(Date);
    expect(result.url).toBe('https://example.com/report');
  });
});
