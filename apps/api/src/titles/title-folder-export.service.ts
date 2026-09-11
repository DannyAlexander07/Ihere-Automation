import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { hasPermission } from '../common/auth/auth-principal';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { ExportTitleFolderDto } from './dto/export-title-folder.dto';

type FolderTitle = Awaited<
  ReturnType<TitleFolderExportService['loadTitles']>
>[number];

const titleColors = {
  navy: '10243E',
  teal: '179C8C',
  ink: '17212F',
  muted: '617083',
  line: 'D9E2EC',
  pale: 'F5F7FA',
  white: 'FFFFFF',
};

@Injectable()
export class TitleFolderExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async render(input: ExportTitleFolderDto, principal: AuthPrincipal) {
    if (!hasPermission(principal, 'titles.read', input.clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
    const titles = await this.loadTitles(
      principal.tenantId,
      input.clientId,
      input.folderKey,
    );
    if (!titles.length) {
      throw new NotFoundException(
        'La carpeta de títulos no existe o está vacía.',
      );
    }
    const first = titles[0];
    const topic =
      first.generationRun?.campaignTopic ?? 'Propuestas editoriales';
    const campaign = campaignLabel(
      first.generationRun?.campaignYear,
      first.generationRun?.campaignMonth,
    );
    const buffer =
      input.format === 'DOCX'
        ? await this.docx(titles, topic, campaign)
        : await this.pdf(titles, topic, campaign);
    const extension = input.format.toLowerCase();
    const fileName = `${slug(first.client.name)}-${slug(topic)}-${campaign.replace(/\s+/g, '-')}.${extension}`;
    await this.audit.record({
      tenantId: principal.tenantId,
      clientId: input.clientId,
      userId: principal.userId,
      action: 'title.folder.export.downloaded',
      entityType: 'TitleFolder',
      entityId: input.folderKey,
      requestId: principal.requestId,
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      metadata: { format: input.format, titleCount: titles.length },
    });
    return {
      buffer,
      fileName,
      mimeType:
        input.format === 'DOCX'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
    };
  }

  private loadTitles(tenantId: string, clientId: string, folderKey: string) {
    return this.prisma.titleProposal.findMany({
      where: {
        tenantId,
        clientId,
        generationRun: { editorialFolderKey: folderKey },
      },
      include: {
        client: { select: { name: true } },
        generationRun: {
          select: {
            campaignYear: true,
            campaignMonth: true,
            campaignTopic: true,
            createdAt: true,
            inputSnapshot: true,
            requestedBy: { select: { displayName: true } },
          },
        },
        evaluations: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { agentResults: { orderBy: { agentType: 'asc' } } },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    });
  }

  private async docx(titles: FolderTitle[], topic: string, campaign: string) {
    const first = titles[0];
    const children: Array<Paragraph | Table> = [
      paragraph('MOOD | PAQUETE EDITORIAL', {
        accent: true,
        bold: true,
        size: 18,
        after: 180,
      }),
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 150, line: 500 },
        children: [
          new TextRun({
            text: 'Propuestas de títulos para revisión',
            bold: true,
            color: '000000',
            size: 50,
            font: 'Arial',
          }),
        ],
      }),
      paragraph(first.client.name, { bold: true, size: 28, after: 80 }),
      paragraph(`${campaign} | ${topic}`, {
        muted: true,
        size: 22,
        after: 260,
      }),
      paragraph(
        'Documento de trabajo previo a la aprobación. Reúne el contexto, la intención y los sustentos de cada propuesta para que el cliente pueda revisarlas sin abrir enlaces externos.',
        { size: 23, after: 220 },
      ),
      heading('Resumen del paquete', 1),
      titleOverviewTable(titles),
      paragraph(`Total de propuestas: ${titles.length}`, {
        bold: true,
        muted: true,
        before: 140,
        after: 180,
      }),
      new Paragraph({ children: [new PageBreak()] }),
    ];
    titles.forEach((title, index) => {
      if (index > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      children.push(
        heading(`Título ${index + 1}`, 2),
        heading(title.title, 1),
        paragraph(
          `${statusLabel(title.status)} | Versión ${title.currentVersion}`,
          {
            muted: true,
            bold: true,
            after: 170,
          },
        ),
        titleDetailTable(title),
        heading('Sustento de evaluación', 2),
      );
      const evaluation = title.evaluations[0];
      if (!evaluation) {
        children.push(
          paragraph('Aún no existe una evaluación registrada.', {
            muted: true,
          }),
        );
      } else {
        children.push(
          paragraph(
            `${verdictLabel(evaluation.verdict)}${evaluation.overallScore === null ? '' : ` | ${evaluation.overallScore}/100`}${evaluation.summary ? `. ${evaluation.summary}` : ''}`,
            { bold: true, after: 140 },
          ),
          evaluationTable(evaluation.agentResults),
        );
      }
    });
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun('Cómo responder')],
      }),
      paragraph(
        'Para cada título indique si está aprobado, requiere ajustes o debe descartarse. Cuando solicite un cambio, detalle el motivo para que quede registrado y se aplique como criterio editorial en futuras propuestas.',
      ),
      bullet('Aprobado: la propuesta puede avanzar a redacción.'),
      bullet('Requiere ajustes: indique qué debe cambiar y por qué.'),
      bullet(
        'Descartado: explique el motivo para evitar enfoques equivalentes.',
      ),
    );
    const document = new Document({
      creator: 'Mood',
      title: `Propuestas de títulos - ${first.client.name}`,
      subject: 'Propuestas editoriales y sustentos de evaluación',
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 21, color: titleColors.ink },
            paragraph: { spacing: { after: 105, line: 270 } },
          },
          heading1: {
            run: { font: 'Arial', size: 31, bold: true, color: '000000' },
            paragraph: { spacing: { before: 220, after: 130 }, keepNext: true },
          },
          heading2: {
            run: { font: 'Arial', size: 24, bold: true, color: '000000' },
            paragraph: { spacing: { before: 190, after: 90 }, keepNext: true },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12_240, height: 15_840 },
              margin: {
                top: 1_200,
                right: 1_100,
                bottom: 1_150,
                left: 1_100,
                footer: 650,
              },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `Mood | ${first.client.name} | Página `,
                      color: titleColors.muted,
                      size: 16,
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      color: titleColors.muted,
                      size: 16,
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(document);
  }

  private async pdf(titles: FolderTitle[], topic: string, campaign: string) {
    const first = titles[0];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 60, right: 58, bottom: 60, left: 58 },
      bufferPages: true,
      info: {
        Title: `Propuestas de títulos - ${first.client.name}`,
        Author: 'Mood',
        Creator: 'Mood',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });
    doc.y = 86;
    pdfHeading(doc, 'MOOD | PAQUETE EDITORIAL', 9.5, '#179C8C');
    pdfHeading(doc, 'Propuestas de títulos para revisión', 27, '#000000');
    pdfHeading(doc, first.client.name, 17, '#10243E');
    pdfText(doc, `${campaign} | ${topic}`, '#617083', 11);
    pdfText(
      doc,
      'Documento de trabajo previo a la aprobación. Incluye contexto y sustentos para revisión sin abrir enlaces externos.',
      '#17212F',
      11,
    );
    doc.moveDown(1);
    pdfHeading(doc, 'Resumen del paquete', 15, '#000000');
    titles.forEach((title, index) => {
      ensureTitlePdfSpace(doc, 48);
      const top = doc.y + 7;
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#10243E')
        .text(`${index + 1}`, 58, top, { width: 24 });
      doc
        .font('Helvetica-Bold')
        .fillColor('#17212F')
        .text(title.title, 88, top, { width: 365, lineGap: 2 });
      const rowBottom = Math.max(doc.y, top + 14);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#617083')
        .text(statusLabel(title.status), 465, top, {
          width: 70,
          align: 'right',
        });
      doc.y = rowBottom + 12;
    });
    titles.forEach((title, index) => {
      doc.addPage();
      pdfHeading(doc, `TÍTULO ${index + 1}`, 9.5, '#179C8C');
      pdfHeading(doc, title.title, 19, '#000000');
      pdfText(
        doc,
        `${statusLabel(title.status)} | Versión ${title.currentVersion}`,
        '#617083',
        9,
      );
      [
        ['Servicio', title.service],
        ['Objetivo', title.objective],
        ['Público', title.audience],
        ['Intención de búsqueda', title.searchIntent],
        ['Enfoque', title.focus],
        ['Oportunidad', title.opportunity ?? 'No registrada.'],
        ['Riesgo o precaución', title.risk ?? 'No registrado.'],
      ].forEach(([label, value]) => pdfField(doc, label, value));
      pdfHeading(doc, 'Sustento de evaluación', 14, '#000000');
      const evaluation = title.evaluations[0];
      if (!evaluation)
        pdfText(doc, 'Aún no existe una evaluación registrada.', '#617083');
      else {
        pdfField(
          doc,
          'Resultado general',
          `${verdictLabel(evaluation.verdict)}${evaluation.overallScore === null ? '' : ` | ${evaluation.overallScore}/100`}${evaluation.summary ? `. ${evaluation.summary}` : ''}`,
        );
        evaluation.agentResults.forEach((agent) => {
          ensureTitlePdfSpace(doc, 80);
          pdfField(
            doc,
            agentLabel(agent.agentType),
            `${verdictLabel(agent.verdict)}${agent.score === null ? '' : ` | ${agent.score}/100`}. ${agent.summary}`,
          );
          const support = [
            ...stringsFromUnknown(agent.findings).slice(0, 3),
            ...stringsFromUnknown(agent.evidence).slice(0, 2),
          ];
          support.forEach((item) => pdfBullet(doc, item));
        });
      }
    });
    doc.addPage();
    pdfHeading(doc, 'Cómo responder', 19, '#000000');
    pdfText(
      doc,
      'Para cada título indique si está aprobado, requiere ajustes o debe descartarse. Cuando solicite un cambio, detalle el motivo para que quede registrado y se aplique como criterio editorial en futuras propuestas.',
      '#17212F',
      11,
    );
    pdfBullet(doc, 'Aprobado: la propuesta puede avanzar a redacción.');
    pdfBullet(doc, 'Requiere ajustes: indique qué debe cambiar y por qué.');
    pdfBullet(
      doc,
      'Descartado: explique el motivo para evitar enfoques equivalentes.',
    );
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc
        .save()
        .strokeColor('#D9E2EC')
        .lineWidth(0.5)
        .moveTo(58, doc.page.height - 42)
        .lineTo(doc.page.width - 58, doc.page.height - 42)
        .stroke()
        .restore();
    }
    doc.end();
    return done;
  }
}

function paragraph(
  text: string,
  options: {
    bold?: boolean;
    accent?: boolean;
    muted?: boolean;
    size?: number;
    before?: number;
    after?: number;
  } = {},
) {
  return new Paragraph({
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 110,
      line: 270,
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size,
        color: options.accent
          ? titleColors.teal
          : options.muted
            ? titleColors.muted
            : titleColors.ink,
      }),
    ],
  });
}

function heading(text: string, level: 1 | 2) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, color: '000000' })],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70 },
    children: [new TextRun(text)],
  });
}

function titleOverviewTable(titles: FolderTitle[]) {
  return docxTable(
    ['N.º', 'Propuesta', 'Intención', 'Estado'],
    titles.map((title, index) => [
      `${index + 1}`,
      title.title,
      title.searchIntent,
      statusLabel(title.status),
    ]),
    [650, 5_450, 1_750, 1_650],
    [
      AlignmentType.CENTER,
      AlignmentType.LEFT,
      AlignmentType.CENTER,
      AlignmentType.CENTER,
    ],
  );
}

function titleDetailTable(title: FolderTitle) {
  return docxTable(
    ['Campo', 'Detalle'],
    [
      ['Servicio', title.service],
      ['Objetivo', title.objective],
      ['Público', title.audience],
      ['Intención de búsqueda', title.searchIntent],
      ['Enfoque', title.focus],
      ['Oportunidad', title.opportunity ?? 'No registrada.'],
      ['Precaución', title.risk ?? 'No registrada.'],
    ],
    [2_350, 7_150],
    [AlignmentType.LEFT, AlignmentType.LEFT],
  );
}

function evaluationTable(
  agents: FolderTitle['evaluations'][number]['agentResults'],
) {
  const rows = agents.map((agent) => {
    const support = [
      ...stringsFromUnknown(agent.findings).slice(0, 3),
      ...stringsFromUnknown(agent.evidence).slice(0, 2),
    ];
    return [
      agentLabel(agent.agentType),
      `${verdictLabel(agent.verdict)}${agent.score === null ? '' : ` | ${agent.score}/100`}`,
      [agent.summary, ...support].filter(Boolean).join(' '),
    ];
  });
  return docxTable(
    ['Revisión', 'Resultado', 'Sustento'],
    rows,
    [2_150, 1_650, 5_700],
    [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.LEFT],
  );
}

function docxTable(
  headers: string[],
  rows: string[][],
  widths: number[],
  alignments: Array<(typeof AlignmentType)[keyof typeof AlignmentType]>,
) {
  const border = {
    style: BorderStyle.SINGLE,
    size: 5,
    color: titleColors.line,
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map(
          (header, index) =>
            new TableCell({
              width: { size: widths[index], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: { type: ShadingType.CLEAR, fill: titleColors.navy },
              margins: { top: 120, bottom: 120, left: 130, right: 130 },
              children: [
                new Paragraph({
                  alignment: alignments[index],
                  children: [
                    new TextRun({
                      text: header,
                      bold: true,
                      color: titleColors.white,
                      size: 17,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (row, rowIndex) =>
          new TableRow({
            cantSplit: true,
            children: row.map(
              (value, index) =>
                new TableCell({
                  width: { size: widths[index], type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  shading: {
                    type: ShadingType.CLEAR,
                    fill: rowIndex % 2 ? titleColors.pale : titleColors.white,
                  },
                  margins: { top: 120, bottom: 120, left: 130, right: 130 },
                  children: [
                    new Paragraph({
                      alignment: alignments[index],
                      spacing: { line: 245 },
                      children: [
                        new TextRun({
                          text: value,
                          bold: index === 0,
                          color: titleColors.ink,
                          size: 17,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  });
}

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(stringsFromUnknown);
  return [];
}

function agentLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function statusLabel(value: string) {
  return (
    (
      {
        DRAFT: 'Borrador',
        PROPOSED: 'Propuesto',
        EVALUATING: 'En evaluación',
        CHANGES_REQUESTED: 'Observado',
        APPROVED: 'Aprobado',
        REJECTED: 'Rechazado',
        USED: 'Utilizado',
        ARCHIVED: 'Archivado',
      } as Record<string, string>
    )[value] ?? value
  );
}

function verdictLabel(value: string | null) {
  if (!value) return 'Sin veredicto';
  return (
    (
      {
        PASS: 'Validado',
        BLOCK: 'Requiere ajustes',
        WARN: 'Validado con precauciones',
      } as Record<string, string>
    )[value] ?? value
  );
}

function campaignLabel(
  year: number | null | undefined,
  month: number | null | undefined,
) {
  if (!year || !month) return 'periodo-no-definido';
  return new Intl.DateTimeFormat('es-PE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function slug(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'titulos'
  );
}

function pdfHeading(
  doc: PDFKit.PDFDocument,
  text: string,
  size: number,
  color = '#172033',
) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(size).fillColor(color).moveDown(0.4);
  const top = doc.y;
  const height = doc.heightOfString(text, { width, lineGap: 2 });
  doc.text(text, left, top, { width, lineGap: 2 });
  doc.x = left;
  doc.y = top + height;
}

function pdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  color = '#172033',
  size = 10,
) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica').fontSize(size).fillColor(color).moveDown(0.35);
  const top = doc.y;
  const height = doc.heightOfString(text, { width, lineGap: 3 });
  doc.text(text, left, top, { width, lineGap: 3 });
  doc.x = left;
  doc.y = top + height;
}

function pdfField(doc: PDFKit.PDFDocument, label: string, value: string) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(10).moveDown(0.45);
  const top = doc.y;
  const labelText = `${label}: `;
  const labelWidth = Math.min(doc.widthOfString(labelText) + 8, width * 0.36);
  const valueWidth = width - labelWidth;
  doc.fillColor('#1F4D78');
  const labelHeight = doc.heightOfString(labelText, { width: labelWidth });
  doc.text(labelText, left, top, { width: labelWidth });
  doc.font('Helvetica').fillColor('#172033');
  const valueHeight = doc.heightOfString(value, {
    width: valueWidth,
    lineGap: 3,
  });
  doc.text(value, left + labelWidth, top, { width: valueWidth, lineGap: 3 });
  doc.x = left;
  doc.y = top + Math.max(labelHeight, valueHeight);
}

function pdfBullet(doc: PDFKit.PDFDocument, text: string) {
  const width = doc.page.width - 138;
  const height = doc.heightOfString(text, { width, lineGap: 3 });
  ensureTitlePdfSpace(doc, height + 18);
  const top = doc.y + 5;
  doc.circle(67, top + 5, 1.7).fill('#179C8C');
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#17212F')
    .text(text, 80, top, { width, lineGap: 3 });
  doc.x = doc.page.margins.left;
  doc.y = top + height + 7;
}

function ensureTitlePdfSpace(doc: PDFKit.PDFDocument, required: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 18;
  if (doc.y + required > bottom) doc.addPage();
}
