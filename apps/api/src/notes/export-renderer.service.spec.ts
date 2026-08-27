import { ExportFormat, NoteSourceType } from '../generated/prisma/client';
import type { ExportInput } from './export-types';
import { ExportRendererService } from './export-renderer.service';
import { ADECCO_CONTACT_URL } from './editorial-cta';

describe('ExportRendererService', () => {
  const service = new ExportRendererService();
  const base: Omit<ExportInput, 'format'> = {
    tenantId: 'tenant',
    clientId: 'client',
    clientName: 'Cliente de prueba',
    noteId: 'note',
    version: 2,
    title: 'Guía editorial <segura>',
    metaTitle: 'Guía editorial segura',
    metaDescription: 'Descripción verificable de una nota aprobada.',
    slug: 'guia-editorial-segura',
    excerpt: 'Resumen de la nota para verificar el entregable.',
    authorName: 'Especialista de prueba',
    authorRole: 'Consultoría',
    ctaText: 'Conoce el servicio',
    ctaUrl: 'https://example.com/servicio',
    internalLinks: ['https://example.com/blog'],
    blocks: [
      {
        id: 'intro',
        type: 'paragraph',
        text: 'Texto <script>alert(1)</script> en la [fuente oficial](https://example.com/fuente) seguro.',
      },
      { id: 'h2', type: 'heading', level: 2, text: 'Primera sección' },
      { id: 'list', type: 'bullet_list', items: ['Uno', 'Dos'] },
      { id: 'callout', type: 'callout', text: 'Revisión humana obligatoria.' },
    ],
    sources: [
      {
        type: NoteSourceType.PRIMARY,
        title: 'Fuente primaria',
        entity: 'Entidad oficial',
        url: 'https://example.com/fuente',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        accessedAt: new Date('2026-08-16T00:00:00.000Z'),
      },
    ],
  };

  it('escapa el contenido HTML y conserva la estructura editorial', async () => {
    const rendered = await service.render({
      ...base,
      format: ExportFormat.HTML,
    });
    const html = rendered.buffer.toString('utf8');
    expect(rendered.extension).toBe('html');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<h2>Primera sección</h2>');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(
      '<a href="https://example.com/fuente" rel="noopener noreferrer">fuente oficial</a>',
    );
    expect(html).not.toContain('[fuente oficial](');
  });

  it('presenta el CTA institucional de Adecco con una acción humana', async () => {
    const rendered = await service.render({
      ...base,
      ctaText: 'Contacta a un especialista de Adecco.',
      ctaUrl: ADECCO_CONTACT_URL,
      format: ExportFormat.HTML,
    });
    const html = rendered.buffer.toString('utf8');
    expect(html).toContain(`href="${ADECCO_CONTACT_URL}"`);
    expect(html).toContain('Contacta a un especialista</a>');
  });

  it.each([
    [ExportFormat.DOCX, 'docx', Buffer.from([0x50, 0x4b])],
    [ExportFormat.PDF, 'pdf', Buffer.from('%PDF-')],
  ] as const)(
    'genera un %s estructuralmente reconocible',
    async (format, extension, signature) => {
      const rendered = await service.render({ ...base, format });
      expect(rendered.extension).toBe(extension);
      expect(rendered.buffer.subarray(0, signature.byteLength)).toEqual(
        signature,
      );
      expect(rendered.buffer.byteLength).toBeGreaterThan(2_000);
    },
  );

  it('no agrega páginas vacías al numerar el PDF', async () => {
    const rendered = await service.render({
      ...base,
      format: ExportFormat.PDF,
    });
    const pageObjects = rendered.buffer
      .toString('latin1')
      .match(/\/Type \/Page\b/g);

    expect(pageObjects).toHaveLength(1);
  });
});
