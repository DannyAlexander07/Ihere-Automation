import { buildEditorialBriefSnapshot } from './editorial-brief';

describe('buildEditorialBriefSnapshot', () => {
  it('freezes a complete brief without inventing client-owned evidence', () => {
    const brief = buildEditorialBriefSnapshot({
      id: 'title-1',
      service: 'Facility Management',
      title:
        'Cómo evaluar un servicio de Facility Management en operaciones exigentes',
      slug: 'evaluar-facility-management-operaciones-exigentes',
      objective: 'Ayudar a comparar criterios operativos antes de contratar.',
      audience: 'Gerencias de Operaciones y Recursos Humanos',
      searchIntent: 'Comparar',
      focus: 'Continuidad, trazabilidad y responsabilidades',
      opportunity: 'Incluir una matriz de evaluación verificable.',
      risk: 'No garantizar ahorros ni continuidad absoluta.',
      approvedAt: new Date('2026-08-19T10:00:00.000Z'),
    });

    expect(brief).toMatchObject({
      briefVersion: 3,
      titleProposalId: 'title-1',
      titles: {
        editorialTitle:
          'Cómo evaluar un servicio de Facility Management en operaciones exigentes',
        h1: 'Cómo evaluar un servicio de Facility Management en operaciones exigentes',
        seoTitle: null,
        slug: 'evaluar-facility-management-operaciones-exigentes',
        metaDescription: null,
      },
      reader: {
        intent: 'Comparar',
        audience: 'Gerencias de Operaciones y Recursos Humanos',
      },
      conversion: { service: 'Facility Management' },
    });
    expect(JSON.stringify(brief)).toContain('fuente primaria');
    expect(JSON.stringify(brief)).toContain('1,200 y 1,800');
    expect(JSON.stringify(brief)).not.toContain(
      'resultados garantizados de Adecco',
    );
  });
});
