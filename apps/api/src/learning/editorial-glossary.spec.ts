import {
  evaluateEditorialGlossary,
  parseEditorialGlossaries,
} from './editorial-glossary';

describe('editorial glossary', () => {
  it('normaliza reglas válidas e ignora entradas incompletas', () => {
    const entries = parseEditorialGlossaries([
      {
        entries: [
          {
            preferredTerm: 'Outsourcing de Gestión Humana',
            variants: ['tercerización de RR. HH.', 'tercerización de RR. HH.'],
            guidance: 'Usar el nombre comercial autorizado.',
          },
          { preferredTerm: 'Payroll' },
        ],
      },
    ]);

    expect(entries).toEqual([
      {
        preferredTerm: 'Outsourcing de Gestión Humana',
        variants: ['tercerización de RR. HH.'],
        guidance: 'Usar el nombre comercial autorizado.',
      },
    ]);
  });

  it('detecta una variante no autorizada sin marcar el término preferido', () => {
    const entries = [
      {
        preferredTerm: 'Outsourcing de Gestión Humana',
        variants: ['tercerización de recursos humanos'],
        guidance: 'Usar el nombre comercial autorizado.',
      },
    ];

    expect(
      evaluateEditorialGlossary(
        'La tercerización de recursos humanos puede evaluarse con criterios claros.',
        entries,
      ),
    ).toEqual([
      {
        preferredTerm: 'Outsourcing de Gestión Humana',
        matchedVariant: 'tercerización de recursos humanos',
        guidance: 'Usar el nombre comercial autorizado.',
      },
    ]);
    expect(
      evaluateEditorialGlossary(
        'Conoce Outsourcing de Gestión Humana.',
        entries,
      ),
    ).toEqual([]);
  });
});
