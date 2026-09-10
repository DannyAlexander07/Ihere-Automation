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
  TextRun,
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
    const children: Paragraph[] = [
      paragraph('I HERE · PAQUETE EDITORIAL', {
        blue: true,
        bold: true,
        size: 20,
      }),
      paragraph('Propuestas de títulos para revisión', {
        bold: true,
        size: 42,
        after: 120,
      }),
      paragraph(first.client.name, { bold: true, size: 26 }),
      paragraph(`${campaign} · ${topic}`, {
        muted: true,
        size: 22,
        after: 220,
      }),
      callout(
        'Documento de trabajo previo a la aprobación. Reúne el contexto, la intención y los sustentos de cada propuesta para que el cliente pueda revisarlas sin abrir enlaces externos.',
      ),
      paragraph(`Total: ${titles.length} propuestas`, {
        bold: true,
        after: 240,
      }),
    ];
    titles.forEach((title, index) => {
      if (index > 0)
        children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun(`${index + 1}. ${title.title}`)],
        }),
        paragraph(
          `Estado: ${statusLabel(title.status)} · Versión ${title.currentVersion}`,
          {
            muted: true,
          },
        ),
        field('Servicio', title.service),
        field('Objetivo', title.objective),
        field('Público', title.audience),
        field('Intención de búsqueda', title.searchIntent),
        field('Enfoque', title.focus),
        field('Oportunidad', title.opportunity ?? 'No registrada.'),
        field('Riesgo o precaución', title.risk ?? 'No registrado.'),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun('Sustento de evaluación')],
        }),
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
          field(
            'Resultado general',
            `${evaluation.verdict ?? 'Sin veredicto'}${evaluation.overallScore === null ? '' : ` · ${evaluation.overallScore}/100`}${evaluation.summary ? ` · ${evaluation.summary}` : ''}`,
          ),
        );
        evaluation.agentResults.forEach((agent) => {
          children.push(
            field(
              agentLabel(agent.agentType),
              `${agent.verdict}${agent.score === null ? '' : ` · ${agent.score}/100`}: ${agent.summary}`,
            ),
          );
          stringsFromUnknown(agent.findings).forEach((finding) =>
            children.push(bullet(finding)),
          );
          stringsFromUnknown(agent.evidence)
            .slice(0, 6)
            .forEach((evidence) =>
              children.push(bullet(`Evidencia: ${evidence}`)),
            );
        });
      }
    });
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun('Cómo responder')],
      }),
      paragraph(
        'Para cada título indique: aprobado, observado o rechazado. Cuando solicite cambios, detalle el motivo para que I HERE lo conserve como aprendizaje editorial y lo aplique en futuras propuestas.',
      ),
    );
    const document = new Document({
      creator: 'I HERE',
      title: `Propuestas de títulos - ${first.client.name}`,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22, color: '172033' } },
          heading1: {
            run: { font: 'Calibri', size: 30, bold: true, color: '1687E8' },
          },
          heading2: {
            run: { font: 'Calibri', size: 25, bold: true, color: '1F4D78' },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun('I HERE · Página '),
                    new TextRun({ children: [PageNumber.CURRENT] }),
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
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });
    pdfHeading(doc, 'I HERE · PAQUETE EDITORIAL', 10, '#1687E8');
    pdfHeading(doc, 'Propuestas de títulos para revisión', 24);
    pdfHeading(doc, first.client.name, 16);
    pdfText(doc, `${campaign} · ${topic}`, '#64748B');
    pdfText(
      doc,
      'Documento de trabajo previo a la aprobación. Incluye contexto y sustentos para revisión sin abrir enlaces externos.',
      '#1F4D78',
    );
    titles.forEach((title, index) => {
      doc.addPage();
      pdfHeading(doc, `${index + 1}. ${title.title}`, 18);
      pdfText(
        doc,
        `Estado: ${statusLabel(title.status)} · Versión ${title.currentVersion}`,
        '#64748B',
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
      pdfHeading(doc, 'Sustento de evaluación', 14, '#1687E8');
      const evaluation = title.evaluations[0];
      if (!evaluation)
        pdfText(doc, 'Aún no existe una evaluación registrada.', '#64748B');
      else {
        pdfField(
          doc,
          'Resultado general',
          `${evaluation.verdict ?? 'Sin veredicto'}${evaluation.overallScore === null ? '' : ` · ${evaluation.overallScore}/100`}${evaluation.summary ? ` · ${evaluation.summary}` : ''}`,
        );
        evaluation.agentResults.forEach((agent) => {
          pdfField(
            doc,
            agentLabel(agent.agentType),
            `${agent.verdict}${agent.score === null ? '' : ` · ${agent.score}/100`}: ${agent.summary}`,
          );
          stringsFromUnknown(agent.findings).forEach((item) =>
            pdfText(doc, `• ${item}`),
          );
        });
      }
    });
    doc.addPage();
    pdfHeading(doc, 'Cómo responder', 18, '#1687E8');
    pdfText(
      doc,
      'Para cada título indique: aprobado, observado o rechazado. Si solicita cambios, detalle el motivo; I HERE lo conservará como aprendizaje editorial para futuras propuestas.',
    );
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text(`${page + 1} / ${range.count}`, 0, doc.page.height - 38, {
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
    return done;
  }
}

function paragraph(
  text: string,
  options: {
    bold?: boolean;
    blue?: boolean;
    muted?: boolean;
    size?: number;
    after?: number;
  } = {},
) {
  return new Paragraph({
    spacing: { after: options.after ?? 110, line: 270 },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size,
        color: options.blue ? '1687E8' : options.muted ? '64748B' : '172033',
      }),
    ],
  });
}

function field(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 110, line: 270 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: '1F4D78' }),
      new TextRun(value),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70 },
    children: [new TextRun(text)],
  });
}

function callout(text: string) {
  return new Paragraph({
    spacing: { before: 100, after: 220, line: 270 },
    indent: { left: 220, right: 160 },
    shading: { type: ShadingType.CLEAR, fill: 'EFF7FF' },
    border: { left: { style: BorderStyle.SINGLE, size: 20, color: '1687E8' } },
    children: [new TextRun(text)],
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
  doc
    .moveDown(0.4)
    .font('Helvetica-Bold')
    .fontSize(size)
    .fillColor(color)
    .text(text, { lineGap: 2 });
}

function pdfText(doc: PDFKit.PDFDocument, text: string, color = '#172033') {
  doc
    .moveDown(0.35)
    .font('Helvetica')
    .fontSize(10)
    .fillColor(color)
    .text(text, { lineGap: 3 });
}

function pdfField(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc
    .moveDown(0.45)
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#1F4D78')
    .text(`${label}:`, { continued: true })
    .font('Helvetica')
    .fillColor('#172033')
    .text(` ${value}`, { lineGap: 3 });
}
