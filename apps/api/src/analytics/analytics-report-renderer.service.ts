import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
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

type Metric = {
  current: number;
  previous: number;
  changePercent: number | null;
};
type Recommendation = {
  title: string;
  detail: string;
  priority: string;
  status: string;
  observationCount: number;
  targetUrl: string | null;
  implementationNote: string | null;
};
export type AnalyticsReportInput = {
  clientName: string;
  generatedAt: Date;
  lastSyncCompletedAt: string | Date | null;
  period: {
    startDate: string;
    endDate: string;
    comparisonStartDate: string;
    comparisonEndDate: string;
  };
  metrics: Record<string, Metric>;
  monthly: Array<{
    month: string;
    sessions: number;
    views: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  pagePerformance: Array<{
    title: string;
    url: string | null;
    source: string;
    views: number;
    sessions: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    engagementRate: number;
    keyEvents: number;
  }>;
  recommendations: Recommendation[];
  methodology: { note: string; ga4: string; gsc: string };
};

@Injectable()
export class AnalyticsReportRendererService {
  async render(input: AnalyticsReportInput, format: 'DOCX' | 'PDF') {
    const buffer =
      format === 'DOCX' ? await this.docx(input) : await this.pdf(input);
    return {
      buffer,
      extension: format.toLowerCase(),
      mimeType:
        format === 'DOCX'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
    };
  }

  private async docx(input: AnalyticsReportInput) {
    const children: Paragraph[] = [
      p('I HERE · INFORME MENSUAL', { blue: true, bold: true, size: 20 }),
      p('Informe SEO, GEO y AEO del blog', {
        bold: true,
        size: 42,
        after: 100,
      }),
      p(input.clientName, { bold: true, size: 28 }),
      p(`${date(input.period.startDate)} al ${date(input.period.endDate)}`, {
        muted: true,
        size: 22,
      }),
      callout(
        `Comparación: ${date(input.period.comparisonStartDate)} al ${date(input.period.comparisonEndDate)}. Última sincronización: ${dateTime(input.lastSyncCompletedAt)}.`,
      ),
      heading('Resumen ejecutivo'),
      ...metricParagraphs(input.metrics),
      heading('Desempeño mensual'),
      ...input.monthly.map((row) =>
        p(
          `${month(row.month)} — ${integer(row.views)} vistas · ${integer(row.sessions)} sesiones · ${integer(row.clicks)} clics · ${integer(row.impressions)} impresiones · ${percent(row.ctr)} CTR · posición ${decimal(row.position)}`,
        ),
      ),
      new Paragraph({ children: [new PageBreak()] }),
      heading('Desempeño por nota'),
      ...input.pagePerformance.flatMap((page, index) => [
        subheading(`${index + 1}. ${page.title}`),
        p(
          `${page.source === 'I_HERE' ? 'Nota gestionada en I HERE' : 'Histórico del blog'} · ${integer(page.views)} vistas · ${integer(page.sessions)} sesiones · ${integer(page.clicks)} clics · ${integer(page.impressions)} impresiones · ${percent(page.ctr)} CTR · posición ${decimal(page.position)} · interacción ${percent(page.engagementRate)} · ${integer(page.keyEvents)} eventos clave`,
        ),
        ...(page.url ? [p(page.url, { muted: true, size: 18 })] : []),
      ]),
      new Paragraph({ children: [new PageBreak()] }),
      heading('Recomendaciones y seguimiento'),
      ...(input.recommendations.length
        ? input.recommendations.flatMap((item, index) => [
            subheading(`${index + 1}. ${item.title}`),
            p(
              `${item.priority} · ${status(item.status)} · ${item.observationCount} observación${item.observationCount === 1 ? '' : 'es'}${item.observationCount >= 2 && item.status === 'OPEN' ? ' · ALERTA: pendiente por segunda vez' : ''}`,
              {
                blue: item.observationCount >= 2 && item.status === 'OPEN',
                bold: true,
              },
            ),
            p(item.detail),
            ...(item.implementationNote
              ? [
                  p(`Validación registrada: ${item.implementationNote}`, {
                    muted: true,
                  }),
                ]
              : []),
          ])
        : [
            p(
              'No se detectaron alertas accionables con los datos disponibles en este periodo.',
              { muted: true },
            ),
          ]),
      heading('Aprendizajes del periodo'),
      ...learning(input).map((item) => bullet(item)),
      heading('Metodología y lectura responsable'),
      p(input.methodology.note),
      p(input.methodology.ga4),
      p(input.methodology.gsc),
      p(
        'Las variaciones comparan periodos equivalentes. Las recomendaciones combinan señales de rendimiento y verificaciones técnicas; su implementación debe validarse con el responsable del sitio.',
        { muted: true },
      ),
    ];
    const doc = new Document({
      creator: 'I HERE',
      title: `Informe del blog - ${input.clientName}`,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22, color: '172033' } },
          heading1: {
            run: { font: 'Calibri', size: 31, bold: true, color: '1687E8' },
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
              margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
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
    return Packer.toBuffer(doc);
  }

  private async pdf(input: AnalyticsReportInput) {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 56, right: 54, bottom: 58, left: 54 },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });
    ph(doc, 'I HERE · INFORME MENSUAL', 10, '#1687E8');
    ph(doc, 'Informe SEO, GEO y AEO del blog', 24);
    ph(doc, input.clientName, 17);
    pt(
      doc,
      `${date(input.period.startDate)} al ${date(input.period.endDate)}`,
      '#64748B',
    );
    pt(
      doc,
      `Comparación: ${date(input.period.comparisonStartDate)} al ${date(input.period.comparisonEndDate)} · Última sincronización: ${dateTime(input.lastSyncCompletedAt)}.`,
      '#1F4D78',
    );
    section(doc, 'Resumen ejecutivo');
    metricLines(input.metrics).forEach((item) => pt(doc, item));
    section(doc, 'Desempeño mensual');
    input.monthly.forEach((row) =>
      pt(
        doc,
        `${month(row.month)} — ${integer(row.views)} vistas · ${integer(row.sessions)} sesiones · ${integer(row.clicks)} clics · ${integer(row.impressions)} impresiones · ${percent(row.ctr)} CTR · posición ${decimal(row.position)}`,
      ),
    );
    doc.addPage();
    section(doc, 'Desempeño por nota');
    input.pagePerformance.forEach((page, index) => {
      ph(doc, `${index + 1}. ${page.title}`, 12, '#1F4D78');
      pt(
        doc,
        `${page.source === 'I_HERE' ? 'Nota gestionada en I HERE' : 'Histórico del blog'} · ${integer(page.views)} vistas · ${integer(page.sessions)} sesiones · ${integer(page.clicks)} clics · ${integer(page.impressions)} impresiones · ${percent(page.ctr)} CTR · posición ${decimal(page.position)} · interacción ${percent(page.engagementRate)} · ${integer(page.keyEvents)} eventos clave`,
      );
      if (page.url) pt(doc, page.url, '#64748B');
    });
    doc.addPage();
    section(doc, 'Recomendaciones y seguimiento');
    if (!input.recommendations.length)
      pt(
        doc,
        'No se detectaron alertas accionables con los datos disponibles en este periodo.',
        '#64748B',
      );
    input.recommendations.forEach((item, index) => {
      ph(doc, `${index + 1}. ${item.title}`, 12, '#1F4D78');
      pt(
        doc,
        `${item.priority} · ${status(item.status)} · ${item.observationCount} observación${item.observationCount === 1 ? '' : 'es'}${item.observationCount >= 2 && item.status === 'OPEN' ? ' · ALERTA: pendiente por segunda vez' : ''}`,
        item.observationCount >= 2 && item.status === 'OPEN'
          ? '#C2410C'
          : '#1687E8',
      );
      pt(doc, item.detail);
      if (item.implementationNote)
        pt(doc, `Validación registrada: ${item.implementationNote}`, '#64748B');
    });
    section(doc, 'Aprendizajes del periodo');
    learning(input).forEach((item) => pt(doc, `• ${item}`));
    section(doc, 'Metodología y lectura responsable');
    pt(doc, input.methodology.note);
    pt(doc, input.methodology.ga4);
    pt(doc, input.methodology.gsc);
    pt(
      doc,
      'Las variaciones comparan periodos equivalentes. Las recomendaciones combinan señales de rendimiento y verificaciones técnicas; su implementación debe validarse con el responsable del sitio.',
      '#64748B',
    );
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text(`${page + 1} / ${range.count}`, 0, doc.page.height - 36, {
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
    return done;
  }
}

const labels: Record<string, string> = {
  views: 'Vistas',
  sessions: 'Sesiones',
  activeUsers: 'Usuarios activos',
  engagedSessions: 'Sesiones con interacción',
  averageEngagementTime: 'Tiempo medio de interacción',
  keyEvents: 'Eventos clave',
  clicks: 'Clics orgánicos',
  impressions: 'Impresiones',
  ctr: 'CTR',
  averagePosition: 'Posición media',
};
function metricLines(metrics: Record<string, Metric>) {
  return Object.entries(metrics).map(
    ([key, value]) =>
      `${labels[key] ?? key}: ${metricValue(key, value.current)} · periodo anterior ${metricValue(key, value.previous)} · variación ${change(value.changePercent)}`,
  );
}
function metricParagraphs(metrics: Record<string, Metric>) {
  return metricLines(metrics).map((line) => p(line));
}
function metricValue(key: string, value: number) {
  if (key === 'ctr') return percent(value);
  if (key === 'averagePosition') return decimal(value);
  if (key === 'averageEngagementTime') return `${decimal(value)} s`;
  return integer(value);
}
function learning(input: AnalyticsReportInput) {
  const best = input.pagePerformance.toSorted((a, b) => b.views - a.views)[0];
  const repeated = input.recommendations.filter(
    (item) => item.status === 'OPEN' && item.observationCount >= 2,
  ).length;
  return [
    best
      ? `La nota con mayor consumo fue “${best.title}” con ${integer(best.views)} vistas; su estructura sirve como referencia para próximos contenidos.`
      : 'Aún no hay suficiente detalle por nota para identificar un patrón ganador.',
    repeated
      ? `${repeated} recomendación${repeated === 1 ? '' : 'es'} continúa${repeated === 1 ? '' : 'n'} pendiente${repeated === 1 ? '' : 's'} por segundo periodo y requiere coordinación con el responsable del sitio.`
      : 'No hay recomendaciones abiertas por segunda vez en el periodo seleccionado.',
    'Mantener URL, fecha de publicación y nota de origen confirmadas permite medir cada contenido a 30, 60 y 90 días sin mezclarlo con el resto del sitio.',
  ];
}
function p(
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
    spacing: { after: options.after ?? 105, line: 270 },
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
function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun(text)],
  });
}
function subheading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun(text)],
  });
}
function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun(text)],
  });
}
function callout(text: string) {
  return new Paragraph({
    spacing: { before: 100, after: 220, line: 270 },
    indent: { left: 220, right: 160 },
    shading: { type: ShadingType.CLEAR, fill: 'EFF7FF' },
    children: [new TextRun(text)],
  });
}
function date(value: string | Date | null) {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}
function dateTime(value: string | Date | null) {
  if (!value) return 'Pendiente';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(value));
}
function month(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00Z`));
}
function integer(value: number) {
  return Math.round(value).toLocaleString('es-PE');
}
function decimal(value: number) {
  return value.toLocaleString('es-PE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function percent(value: number) {
  return `${(value * 100).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}
function change(value: number | null) {
  return value === null
    ? 'sin base comparable'
    : `${value >= 0 ? '+' : ''}${decimal(value)}%`;
}
function status(value: string) {
  return (
    (
      {
        OPEN: 'Pendiente',
        IMPLEMENTED: 'Implementada',
        DISMISSED: 'Descartada',
      } as Record<string, string>
    )[value] ?? value
  );
}
function ph(
  doc: PDFKit.PDFDocument,
  text: string,
  size: number,
  color = '#172033',
) {
  doc
    .moveDown(0.45)
    .font('Helvetica-Bold')
    .fontSize(size)
    .fillColor(color)
    .text(text, { lineGap: 2 });
}
function pt(doc: PDFKit.PDFDocument, text: string, color = '#172033') {
  doc
    .moveDown(0.35)
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(color)
    .text(text, { lineGap: 3 });
}
function section(doc: PDFKit.PDFDocument, text: string) {
  ph(doc, text, 16, '#1687E8');
}
