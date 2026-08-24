import { BadRequestException } from '@nestjs/common';
import { NoteContentService } from './note-content.service';

describe('NoteContentService', () => {
  const service = new NoteContentService();

  it('valida bloques seguros y cuenta texto y listas', () => {
    const content = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'intro',
          type: 'paragraph',
          text: 'Una respuesta breve y clara.',
        },
        {
          id: 'pasos',
          type: 'bullet_list',
          items: ['Primer paso útil', 'Segundo paso verificable'],
        },
      ],
    };

    expect(service.validate(content)).toEqual(content);
    expect(service.wordCount(content)).toBe(11);
  });

  it('rechaza HTML libre y encabezados sin jerarquía válida', () => {
    expect(() =>
      service.validate({
        schemaVersion: 1,
        blocks: [{ id: 'raw', type: 'raw_html', text: '<script />' }],
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.validate({
        schemaVersion: 1,
        blocks: [{ id: 'h1', type: 'heading', level: 1, text: 'Título' }],
      }),
    ).toThrow('nivel 2, 3 o 4');
  });

  it('rechaza propiedades adicionales e identificadores duplicados', () => {
    expect(() =>
      service.validate({
        schemaVersion: 1,
        blocks: [
          {
            id: 'intro',
            type: 'paragraph',
            text: 'Contenido visible.',
            html: '<script>alert(1)</script>',
          },
        ],
      }),
    ).toThrow('propiedades no permitidas');

    expect(() =>
      service.validate({
        schemaVersion: 1,
        blocks: [
          { id: 'repetido', type: 'paragraph', text: 'Primer bloque.' },
          { id: 'repetido', type: 'paragraph', text: 'Segundo bloque.' },
        ],
      }),
    ).toThrow('identificador único');
  });

  it('produce la misma huella aunque cambie el orden de las claves', () => {
    const first = { schemaVersion: 1, blocks: [], locale: 'es-PE' };
    const second = { locale: 'es-PE', blocks: [], schemaVersion: 1 };
    expect(service.hash(first)).toBe(service.hash(second));
  });
});
