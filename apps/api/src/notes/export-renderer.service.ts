import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import { ExportFormat } from '../generated/prisma/client';
import type { ExportBlock, ExportInput, RenderedExport } from './export-types';
import { editorialCtaActionLabel } from './editorial-cta';

const colors = {
  blue: '1687E8',
  darkBlue: '1F4D78',
  ink: '172033',
  muted: '64748B',
  border: 'D9E2EC',
  callout: 'EFF7FF',
};

@Injectable()
export class ExportRendererService {
  async render(input: ExportInput): Promise<RenderedExport> {
    switch (input.format) {
      case ExportFormat.HTML:
        return {
          buffer: Buffer.from(this.html(input), 'utf8'),
          extension: 'html',
          mimeType: 'text/html; charset=utf-8',
        };
      case ExportFormat.DOCX:
        return {
          buffer: await this.docx(input),
          extension: 'docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      case ExportFormat.PDF:
        return {
          buffer: await this.pdf(input),
          extension: 'pdf',
          mimeType: 'application/pdf',
        };
    }
  }

  private html(input: ExportInput): string {
    const blocks = input.blocks
      .map((block) => this.htmlBlock(block))
      .join('\n');
    const sources = input.sources
      .map(
        (source) =>
          `<li><strong>${escapeHtml(source.title)}</strong> - ${escapeHtml(source.entity)}. <a href="${escapeAttribute(source.url)}" rel="noopener noreferrer">Consultar fuente</a><span> Consulta: ${formatDate(source.accessedAt)}${source.publishedAt ? ` · Publicación: ${formatDate(source.publishedAt)}` : ''}</span></li>`,
      )
      .join('\n');
    const links = input.internalLinks
      .map(
        (url, index) =>
          `<li><a href="${escapeAttribute(url)}">Contenido relacionado ${index + 1}</a></li>`,
      )
      .join('\n');
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.metaTitle ?? input.title)}</title>
  ${input.metaDescription ? `<meta name="description" content="${escapeAttribute(input.metaDescription)}">` : ''}
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#64748b;--accent:#1687e8;--border:#d9e2ec;--callout:#eff7ff}
    *{box-sizing:border-box}body{margin:0;background:#f7f9fc;color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.65}
    article{width:min(820px,calc(100% - 32px));margin:40px auto;background:#fff;border:1px solid var(--border);border-radius:18px;padding:clamp(24px,5vw,56px);box-shadow:0 18px 50px rgba(23,32,51,.08)}
    .kicker{margin:0 0 12px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.meta{color:var(--muted);font-size:14px}
    h1{font-size:clamp(30px,5vw,48px);line-height:1.08;margin:0 0 16px}h2{font-size:26px;line-height:1.2;margin:36px 0 12px}h3{font-size:21px;line-height:1.25;margin:28px 0 10px}h4{font-size:18px;margin:24px 0 8px}
    p{margin:0 0 16px}ul,ol{margin:0 0 20px;padding-left:26px}li{margin:7px 0}main a{overflow-wrap:anywhere;color:#0b67b2;text-decoration:underline;text-underline-offset:3px}blockquote,.callout{margin:24px 0;padding:18px 20px;border-left:4px solid var(--accent);border-radius:0 12px 12px 0;background:var(--callout)}
    .cta{margin:36px 0 8px;padding:24px;border-radius:16px;background:#172033;color:#fff}.cta a{display:inline-block;margin-top:10px;color:#fff;font-weight:700}
    .references{margin-top:42px;padding-top:26px;border-top:1px solid var(--border)}.references a{overflow-wrap:anywhere;color:#0b67b2}.references span{display:block;color:var(--muted);font-size:12px}
    @media print{body{background:#fff}article{width:auto;margin:0;border:0;box-shadow:none;padding:0}}
  </style>
</head>
<body>
  <article>
    <header>
      <p class="kicker">${escapeHtml(input.clientName)} · Contenido aprobado</p>
      <h1>${escapeHtml(input.title)}</h1>
      ${input.excerpt ? `<p class="meta">${escapeHtml(input.excerpt)}</p>` : ''}
      ${input.authorName ? `<p class="meta"><strong>${escapeHtml(input.authorName)}</strong>${input.authorRole ? ` · ${escapeHtml(input.authorRole)}` : ''}</p>` : ''}
    </header>
    <main>${blocks}</main>
    ${input.ctaText ? `<aside class="cta"><strong>${escapeHtml(input.ctaText)}</strong>${input.ctaUrl ? `<br><a href="${escapeAttribute(input.ctaUrl)}">${escapeHtml(editorialCtaActionLabel(input.ctaUrl))}</a>` : ''}</aside>` : ''}
    <section class="references"><h2>Fuentes</h2><ol>${sources || '<li>No se registraron fuentes.</li>'}</ol>${links ? `<h3>Enlaces internos</h3><ul>${links}</ul>` : ''}<p class="meta">Versión ${input.version} · Exportada desde I HERE</p></section>
  </article>
</body>
</html>`;
  }

  private htmlBlock(block: ExportBlock): string {
    if (block.type === 'heading') {
      const level = Math.min(4, Math.max(2, Number(block.level ?? 2)));
      return `<h${level}>${renderInlineHtml(block.text ?? '')}</h${level}>`;
    }
    if (block.type === 'bullet_list' || block.type === 'ordered_list') {
      const tag = block.type === 'bullet_list' ? 'ul' : 'ol';
      return `<${tag}>${(block.items ?? []).map((item) => `<li>${renderInlineHtml(item)}</li>`).join('')}</${tag}>`;
    }
    if (block.type === 'quote') {
      return `<blockquote>${renderInlineHtml(block.text ?? '')}</blockquote>`;
    }
    if (block.type === 'callout') {
      return `<aside class="callout">${renderInlineHtml(block.text ?? '')}</aside>`;
    }
    return `<p>${renderInlineHtml(block.text ?? '')}</p>`;
  }

  private async docx(input: ExportInput): Promise<Buffer> {
    const children: Paragraph[] = [
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `${input.clientName.toUpperCase()} · CONTENIDO APROBADO`,
            bold: true,
            color: colors.blue,
            size: 20,
            characterSpacing: 20,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: input.title,
            bold: true,
            color: colors.ink,
            size: 48,
          }),
        ],
      }),
    ];
    if (input.excerpt) {
      children.push(
        new Paragraph({
          spacing: { after: 140, line: 280 },
          children: [
            new TextRun({ text: input.excerpt, color: colors.muted, size: 24 }),
          ],
        }),
      );
    }
    if (input.authorName) {
      children.push(
        new Paragraph({
          spacing: { after: 240 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: colors.border,
            },
          },
          children: [
            new TextRun({ text: input.authorName, bold: true, size: 21 }),
            ...(input.authorRole
              ? [
                  new TextRun({
                    text: ` · ${input.authorRole}`,
                    color: colors.muted,
                    size: 21,
                  }),
                ]
              : []),
          ],
        }),
      );
    }
    for (const [index, block] of input.blocks.entries()) {
      children.push(...this.docxBlock(block, index + 1));
    }
    if (input.ctaText) {
      const ctaChildren: Array<TextRun | ExternalHyperlink> = [
        new TextRun({ text: input.ctaText, bold: true, color: colors.ink }),
      ];
      if (input.ctaUrl) {
        ctaChildren.push(
          new TextRun({ text: '  ' }),
          new ExternalHyperlink({
            link: input.ctaUrl,
            children: [
              new TextRun({
                text: editorialCtaActionLabel(input.ctaUrl),
                bold: true,
                color: colors.blue,
                underline: {},
              }),
            ],
          }),
        );
      }
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 220, line: 264 },
          shading: { type: ShadingType.CLEAR, fill: colors.callout },
          border: {
            left: { style: BorderStyle.SINGLE, size: 22, color: colors.blue },
          },
          indent: { left: 240, right: 180 },
          children: ctaChildren,
        }),
      );
    }
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun('Fuentes')],
      }),
    );
    input.sources.forEach((source) => {
      children.push(
        new Paragraph({
          numbering: {
            reference: 'ihere-decimal',
            level: 0,
            instance: input.blocks.length + 1,
          },
          children: [
            new TextRun({
              text: `${source.title} - ${source.entity}. `,
              bold: true,
            }),
            new ExternalHyperlink({
              link: source.url,
              children: [
                new TextRun({
                  text: 'Consultar fuente',
                  color: colors.blue,
                  underline: {},
                }),
              ],
            }),
            new TextRun({
              text: ` Consulta: ${formatDate(source.accessedAt)}${source.publishedAt ? ` · Publicación: ${formatDate(source.publishedAt)}` : ''}.`,
              color: colors.muted,
            }),
          ],
        }),
      );
    });
    if (input.internalLinks.length) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun('Enlaces internos')],
        }),
      );
      input.internalLinks.forEach((url, index) =>
        children.push(
          new Paragraph({
            numbering: { reference: 'ihere-bullet', level: 0 },
            children: [
              new ExternalHyperlink({
                link: url,
                children: [
                  new TextRun({
                    text: `Contenido relacionado ${index + 1}`,
                    color: colors.blue,
                    underline: {},
                  }),
                ],
              }),
            ],
          }),
        ),
      );
    }
    children.push(
      new Paragraph({
        spacing: { before: 220 },
        children: [
          new TextRun({
            text: `Versión ${input.version} · Exportada desde I HERE`,
            color: colors.muted,
            size: 18,
          }),
        ],
      }),
    );

    const createFooter = () =>
      new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: 'Página ',
                color: colors.muted,
                size: 18,
              }),
              new TextRun({
                children: [PageNumber.CURRENT],
                color: colors.muted,
                size: 18,
              }),
            ],
          }),
        ],
      });

    const document = new Document({
      creator: 'I HERE',
      title: input.title,
      description: input.metaDescription ?? undefined,
      evenAndOddHeaderAndFooters: false,
      styles: {
        default: {
          document: {
            run: { font: 'Calibri', size: 22, color: colors.ink },
            paragraph: { spacing: { after: 120, line: 264 } },
          },
          heading1: {
            run: { font: 'Calibri', size: 32, bold: true, color: colors.blue },
            paragraph: { spacing: { before: 320, after: 160 }, keepNext: true },
          },
          heading2: {
            run: { font: 'Calibri', size: 26, bold: true, color: colors.blue },
            paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
          },
          heading3: {
            run: {
              font: 'Calibri',
              size: 24,
              bold: true,
              color: colors.darkBlue,
            },
            paragraph: { spacing: { before: 160, after: 80 }, keepNext: true },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: 'ihere-bullet',
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: 720, hanging: 360 },
                    spacing: { after: 160, line: 280 },
                  },
                },
              },
            ],
          },
          {
            reference: 'ihere-decimal',
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: '%1.',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: 720, hanging: 360 },
                    spacing: { after: 160, line: 280 },
                  },
                },
              },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12_240, height: 15_840 },
              margin: {
                top: 1_440,
                right: 1_440,
                bottom: 1_440,
                left: 1_440,
                header: 708,
                footer: 1_080,
              },
            },
          },
          footers: {
            default: createFooter(),
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(document);
  }

  private docxBlock(
    block: ExportBlock,
    numberingInstance: number,
  ): Paragraph[] {
    if (block.type === 'heading') {
      const heading =
        block.level === 4
          ? HeadingLevel.HEADING_3
          : block.level === 3
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_1;
      return [
        new Paragraph({
          heading,
          children: docxInlineRuns(block.text ?? '', { bold: true }),
        }),
      ];
    }
    if (block.type === 'bullet_list' || block.type === 'ordered_list') {
      return (block.items ?? []).map(
        (item) =>
          new Paragraph({
            numbering: {
              reference:
                block.type === 'bullet_list' ? 'ihere-bullet' : 'ihere-decimal',
              level: 0,
              ...(block.type === 'ordered_list'
                ? { instance: numberingInstance }
                : {}),
            },
            children: docxInlineRuns(item),
          }),
      );
    }
    if (block.type === 'quote' || block.type === 'callout') {
      return [
        new Paragraph({
          spacing: { before: 120, after: 160, line: 264 },
          indent: { left: 240, right: 180 },
          shading: { type: ShadingType.CLEAR, fill: colors.callout },
          border: {
            left: { style: BorderStyle.SINGLE, size: 18, color: colors.blue },
          },
          children: docxInlineRuns(block.text ?? '', {
            italics: block.type === 'quote',
          }),
        }),
      ];
    }
    return [new Paragraph({ children: docxInlineRuns(block.text ?? '') })];
  }

  private async pdf(input: ExportInput): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      bufferPages: true,
      info: {
        Title: input.title,
        Author: input.authorName ?? 'I HERE',
        Creator: 'I HERE',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
      document.once('end', () => resolve(Buffer.concat(chunks)));
      document.once('error', reject);
    });
    const bodyWidth = document.page.width - 144;
    document.y = 72;
    document
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#1687E8')
      .text(`${input.clientName.toUpperCase()} · CONTENIDO APROBADO`, {
        characterSpacing: 1.1,
      });
    document
      .moveDown(0.7)
      .font('Helvetica-Bold')
      .fontSize(25)
      .fillColor('#172033')
      .text(input.title, { lineGap: 2 });
    if (input.excerpt)
      document
        .moveDown(0.6)
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#64748B')
        .text(input.excerpt, { lineGap: 3 });
    if (input.authorName)
      document
        .moveDown(0.7)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#172033')
        .text(
          `${input.authorName}${input.authorRole ? ` · ${input.authorRole}` : ''}`,
        );
    document.moveDown(1.2);
    for (const block of input.blocks) this.pdfBlock(document, block, bodyWidth);
    if (input.ctaText) {
      const height =
        document.heightOfString(input.ctaText, {
          width: bodyWidth - 32,
          lineGap: 3,
        }) + (input.ctaUrl ? 46 : 32);
      ensurePdfSpace(document, height + 20);
      const top = document.y + 8;
      document.roundedRect(72, top, bodyWidth, height, 8).fill('#EFF7FF');
      document.rect(72, top, 4, height).fill('#1687E8');
      document
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#172033')
        .text(input.ctaText, 88, top + 14, {
          width: bodyWidth - 32,
          lineGap: 3,
        });
      if (input.ctaUrl)
        document
          .moveDown(0.5)
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#0B67B2')
          .text(editorialCtaActionLabel(input.ctaUrl), {
            link: input.ctaUrl,
            underline: true,
          });
      document.y = top + height + 14;
    }
    ensurePdfSpace(document, 110);
    document
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#1687E8')
      .text('Fuentes');
    input.sources.forEach((source, index) => {
      document
        .moveDown(0.45)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#172033')
        .text(`${index + 1}. ${source.title} - ${source.entity}.`, {
          lineGap: 2,
        });
      document
        .font('Helvetica')
        .fillColor('#0B67B2')
        .text('Consultar fuente', { link: source.url, underline: true });
      document
        .fillColor('#64748B')
        .fontSize(8.5)
        .text(
          `Consulta: ${formatDate(source.accessedAt)}${source.publishedAt ? ` · Publicación: ${formatDate(source.publishedAt)}` : ''}`,
        );
    });
    if (input.internalLinks.length) {
      document
        .moveDown(0.9)
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#1687E8')
        .text('Enlaces internos');
      input.internalLinks.forEach((url, index) =>
        document
          .moveDown(0.3)
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#0B67B2')
          .text(`Contenido relacionado ${index + 1}`, {
            link: url,
            underline: true,
          }),
      );
    }
    document
      .moveDown(1)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#64748B')
      .text(`Versión ${input.version} · Exportada desde I HERE`);
    const range = document.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      document.switchToPage(index);
      const originalBottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text(
          `${index + 1} / ${range.count}`,
          document.page.width / 2 - 24,
          document.page.height - 50,
          { width: 48, align: 'center', lineBreak: false },
        );
      document.page.margins.bottom = originalBottomMargin;
    }
    document.end();
    return completed;
  }

  private pdfBlock(
    document: PDFKit.PDFDocument,
    block: ExportBlock,
    width: number,
  ): void {
    if (block.type === 'heading') {
      const level = Number(block.level ?? 2);
      const size = level === 2 ? 16 : level === 3 ? 13 : 11;
      ensurePdfSpace(document, size * 3);
      document
        .moveDown(level === 2 ? 1.1 : 0.8)
        .font('Helvetica-Bold')
        .fontSize(size)
        .fillColor(level === 4 ? '#1F4D78' : '#1687E8')
        .text(plainInlineText(block.text ?? ''), { lineGap: 2 });
      return;
    }
    if (block.type === 'bullet_list' || block.type === 'ordered_list') {
      (block.items ?? []).forEach((item, index) => {
        const textWidth = width - 38;
        const itemHeight =
          document.heightOfString(plainInlineLabel(item), {
            width: textWidth,
            lineGap: 3,
          }) + 7;
        ensurePdfSpace(document, itemHeight);
        const top = document.y + 2;
        const textX = 110;
        if (block.type === 'ordered_list') {
          document
            .font('Helvetica')
            .fontSize(10.5)
            .fillColor('#172033')
            .text(`${index + 1}.`, 76, top, {
              width: 24,
              align: 'right',
              lineBreak: false,
            });
        } else {
          document.circle(91, top + 5.5, 1.6).fill('#172033');
        }
        document.y = top;
        document.font('Helvetica').fontSize(10.5).fillColor('#172033');
        this.pdfInlineText(document, item, {
          x: textX,
          y: top,
          width: textWidth,
          paragraphGap: 2,
          lineGap: 3,
        });
      });
      document.moveDown(0.35);
      return;
    }
    if (block.type === 'quote' || block.type === 'callout') {
      const text = plainInlineText(block.text ?? '');
      const height =
        document.heightOfString(text, { width: width - 32, lineGap: 3 }) + 28;
      ensurePdfSpace(document, height + 12);
      const top = document.y + 4;
      document.roundedRect(72, top, width, height, 8).fill('#EFF7FF');
      document.rect(72, top, 4, height).fill('#1687E8');
      document
        .font(block.type === 'quote' ? 'Helvetica-Oblique' : 'Helvetica')
        .fontSize(10.5)
        .fillColor('#172033')
        .text(text, 88, top + 13, { width: width - 32, lineGap: 3 });
      document.y = top + height + 8;
      return;
    }
    document.font('Helvetica').fontSize(10.5).fillColor('#172033');
    this.pdfInlineText(document, block.text ?? '', {
      align: 'left',
      lineGap: 3,
      paragraphGap: 7,
    });
  }

  private pdfInlineText(
    document: PDFKit.PDFDocument,
    value: string,
    options: {
      x?: number;
      y?: number;
      width?: number;
      align?: 'left' | 'center' | 'right' | 'justify';
      lineGap?: number;
      paragraphGap?: number;
    } = {},
  ): void {
    const segments = inlineSegments(value);
    segments.forEach((segment, index) => {
      const last = index === segments.length - 1;
      const textOptions = {
        width: options.width,
        align: options.align,
        lineGap: options.lineGap,
        paragraphGap: last ? options.paragraphGap : 0,
        continued: !last,
        ...(segment.type === 'link'
          ? { link: segment.url, underline: true }
          : {}),
      };
      document.fillColor(segment.type === 'link' ? '#0B67B2' : '#172033');
      const text = segment.type === 'link' ? segment.label : segment.value;
      if (index === 0 && options.x !== undefined) {
        document.text(text, options.x, options.y ?? document.y, textOptions);
      } else {
        document.text(text, textOptions);
      }
    });
  }
}

function ensurePdfSpace(document: PDFKit.PDFDocument, required: number): void {
  const bottom = document.page.height - document.page.margins.bottom - 18;
  if (document.y + required > bottom) document.addPage();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

function inlineSegments(value: string): InlineSegment[] {
  const pattern = /\[([^\]]+)]\(\s*(https?:\/\/\S+?)\s*\)/gi;
  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) {
      segments.push({ type: 'text', value: value.slice(cursor, index) });
    }
    segments.push({ type: 'link', label: match[1], url: match[2] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ type: 'text', value: value.slice(cursor) });
  }
  return segments.length ? segments : [{ type: 'text', value }];
}

function renderInlineHtml(value: string): string {
  return inlineSegments(value)
    .map((segment) =>
      segment.type === 'text'
        ? escapeHtml(segment.value)
        : `<a href="${escapeAttribute(segment.url)}" rel="noopener noreferrer">${escapeHtml(segment.label)}</a>`,
    )
    .join('');
}

function docxInlineRuns(
  value: string,
  style: { bold?: boolean; italics?: boolean } = {},
): Array<TextRun | ExternalHyperlink> {
  return inlineSegments(value).map((segment) =>
    segment.type === 'text'
      ? new TextRun({ text: segment.value, ...style })
      : new ExternalHyperlink({
          link: segment.url,
          children: [
            new TextRun({
              text: segment.label,
              color: colors.blue,
              underline: {},
              ...style,
            }),
          ],
        }),
  );
}

function plainInlineText(value: string): string {
  return inlineSegments(value)
    .map((segment) =>
      segment.type === 'text'
        ? segment.value
        : `${segment.label} (${segment.url})`,
    )
    .join('');
}

function plainInlineLabel(value: string): string {
  return inlineSegments(value)
    .map((segment) => (segment.type === 'text' ? segment.value : segment.label))
    .join('');
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(value);
}
