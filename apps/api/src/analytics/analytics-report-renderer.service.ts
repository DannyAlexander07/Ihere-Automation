import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
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
import type { AnalyticsActionPlanItem } from './analytics-action-plan';

const colors = {
  navy: '10243E',
  blue: '168EEA',
  teal: '179C8C',
  coral: 'D95852',
  ink: '17212F',
  muted: '617083',
  line: 'D9E2EC',
  paleBlue: 'EEF7FF',
  paleTeal: 'ECFBF8',
  paleAmber: 'FFF7E5',
  paleGray: 'F5F7FA',
  white: 'FFFFFF',
};

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

type PagePerformance = {
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
  pagePerformance: PagePerformance[];
  recommendations: Recommendation[];
  actionPlan: AnalyticsActionPlanItem[];
  methodology: { note: string; ga4: string; gsc: string };
};

export type AnalyticsReportView = {
  topPages: PagePerformance[];
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
    const view = buildAnalyticsReportView(input);
    const children: Array<Paragraph | Table> = [
      kicker('MOOD | INFORME MENSUAL'),
      title('Informe mensual SEO GEO y AEO del blog'),
      lead(input.clientName, 28, true),
      lead(
        `${date(input.period.startDate)} al ${date(input.period.endDate)}`,
        22,
      ),
      lead(
        `Comparación con ${date(input.period.comparisonStartDate)} al ${date(input.period.comparisonEndDate)}`,
        19,
      ),
      lead(
        `Preparado el ${date(input.generatedAt)} | Última sincronización ${dateTime(input.lastSyncCompletedAt)}`,
        17,
        false,
        500,
      ),
      paragraph(
        'Este informe resume el rendimiento del blog, las decisiones recomendadas y las responsabilidades de Mood y Adecco Perú para el siguiente periodo.',
        { size: 23, after: 180 },
      ),
      new Paragraph({ children: [new PageBreak()] }),
      heading('Resumen ejecutivo'),
      paragraph(executiveSummary(input), { size: 23, after: 220 }),
      metricGrid(input.metrics),
      heading('Qué significan los resultados', 2),
      ...executiveInsights(input).map(bullet),
      heading('Evolución mensual', 2),
      monthlyTable(input),
      new Paragraph({ children: [new PageBreak()] }),
      heading('Notas con mayor rendimiento'),
      paragraph(
        'Se muestran las diez notas con más vistas del periodo. La portada general del blog no se incluye para que la comparación sea realmente por contenido.',
        { color: colors.muted, after: 170 },
      ),
      topPagesTable(view.topPages),
      heading('Lectura prioritaria', 2),
      ...pageInsights(view.topPages).map(bullet),
      new Paragraph({ children: [new PageBreak()] }),
      heading('Plan de acción'),
      paragraph(
        'Las acciones están separadas por responsable para que el siguiente paso quede claro y pueda validarse en el próximo corte.',
        { color: colors.muted, after: 180 },
      ),
      ...(input.actionPlan.length
        ? input.actionPlan.flatMap((item, index) =>
            actionItem(item, index, input.clientName),
          )
        : [
            paragraph(
              'No hay acciones pendientes sustentadas por los datos del periodo seleccionado.',
              { color: colors.muted },
            ),
          ]),
      heading('Aprendizajes del periodo'),
      ...learning(input, view).map(bullet),
      heading('Fuentes y criterio de lectura'),
      bullet(cleanMethodology(input.methodology.ga4, 'GA4')),
      bullet(cleanMethodology(input.methodology.gsc, 'Google Search Console')),
      bullet(
        'Las variaciones comparan periodos equivalentes. Un cambio de rendimiento orienta la investigación, pero no demuestra por sí solo la causa del resultado.',
      ),
      paragraph(
        `Cierre del informe | ${input.clientName} | ${date(input.period.endDate)}`,
        { color: colors.muted, size: 17, before: 260 },
      ),
    ];

    const document = new Document({
      creator: 'Mood',
      title: `Informe mensual SEO GEO y AEO del blog de ${input.clientName}`,
      subject: 'Rendimiento, aprendizajes y plan de acción',
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 21, color: colors.ink },
            paragraph: { spacing: { after: 105, line: 270 } },
          },
          heading1: {
            run: { font: 'Arial', size: 32, bold: true, color: '000000' },
            paragraph: { spacing: { before: 260, after: 140 }, keepNext: true },
          },
          heading2: {
            run: { font: 'Arial', size: 25, bold: true, color: '000000' },
            paragraph: { spacing: { before: 220, after: 100 }, keepNext: true },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: 'report-bullet',
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: 520, hanging: 260 },
                    spacing: { after: 100, line: 270 },
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
              size: { width: 11_906, height: 16_838 },
              margin: {
                top: 1_050,
                right: 1_050,
                bottom: 1_050,
                left: 1_050,
                header: 520,
                footer: 620,
              },
            },
          },
          footers: { default: footer(input.clientName) },
          children,
        },
      ],
    });
    return Packer.toBuffer(document);
  }

  private async pdf(input: AnalyticsReportInput) {
    const view = buildAnalyticsReportView(input);
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 58, right: 48, bottom: 58, left: 48 },
      bufferPages: true,
      info: {
        Title: `Informe mensual SEO GEO y AEO del blog de ${input.clientName}`,
        Author: 'Mood',
        Creator: 'Mood',
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
      document.once('end', () => resolve(Buffer.concat(chunks)));
      document.once('error', reject);
    });

    pdfCover(document, input);
    document.addPage();
    pdfSection(document, 'Resumen ejecutivo');
    pdfText(document, executiveSummary(input), colors.ink, 11, 4);
    pdfMetricGrid(document, input.metrics);
    pdfSubsection(document, 'Qué significan los resultados');
    executiveInsights(input).forEach((item) => pdfBullet(document, item));
    pdfSubsection(document, 'Evolución mensual');
    pdfTable(
      document,
      ['Mes', 'Vistas', 'Sesiones', 'Clics', 'Impresiones', 'CTR', 'Posición'],
      input.monthly.map((row) => [
        titleCase(month(row.month)),
        integer(row.views),
        integer(row.sessions),
        integer(row.clicks),
        integer(row.impressions),
        percent(row.ctr),
        decimal(row.position),
      ]),
      [110, 55, 58, 48, 72, 52, 55],
      ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
      7.8,
    );

    document.addPage();
    pdfSection(document, 'Notas con mayor rendimiento');
    pdfText(
      document,
      'Se muestran las diez notas con más vistas del periodo. La portada general del blog no se incluye para que la comparación sea realmente por contenido.',
      colors.muted,
      9.5,
      3,
    );
    pdfTable(
      document,
      ['Nota', 'Vistas', 'Sesiones', 'Clics', 'CTR', 'Posición'],
      view.topPages.map((page) => [
        truncate(page.title, 76),
        integer(page.views),
        integer(page.sessions),
        integer(page.clicks),
        percent(page.ctr),
        decimal(page.position),
      ]),
      [240, 52, 55, 48, 55, 58],
      ['left', 'right', 'right', 'right', 'right', 'right'],
      8,
    );
    pdfSubsection(document, 'Lectura prioritaria');
    pageInsights(view.topPages).forEach((item) => pdfBullet(document, item));

    document.addPage();
    pdfSection(document, 'Plan de acción');
    pdfText(
      document,
      'Las acciones están separadas por responsable para que el siguiente paso quede claro y pueda validarse en el próximo corte.',
      colors.muted,
      9.5,
      3,
    );
    if (!input.actionPlan.length) {
      pdfText(
        document,
        'No hay acciones pendientes sustentadas por los datos del periodo seleccionado.',
        colors.muted,
      );
    }
    input.actionPlan.forEach((item, index) =>
      pdfActionItem(document, item, index, input.clientName),
    );

    document.addPage();
    pdfSection(document, 'Aprendizajes del periodo');
    learning(input, view).forEach((item) => pdfBullet(document, item));
    pdfSection(document, 'Fuentes y criterio de lectura');
    pdfBullet(document, cleanMethodology(input.methodology.ga4, 'GA4'));
    pdfBullet(
      document,
      cleanMethodology(input.methodology.gsc, 'Google Search Console'),
    );
    pdfBullet(
      document,
      'Las variaciones comparan periodos equivalentes. Un cambio de rendimiento orienta la investigación, pero no demuestra por sí solo la causa del resultado.',
    );

    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      const originalBottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      if (page > range.start) {
        document
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(`#${colors.muted}`)
          .text('MOOD | INFORME MENSUAL', 48, 25, {
            width: 250,
            lineBreak: false,
          });
      }
      document
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(`#${colors.muted}`)
        .text(
          `${input.clientName} | ${page + 1} / ${range.count}`,
          48,
          document.page.height - 34,
          {
            width: document.page.width - 96,
            align: 'center',
            lineBreak: false,
          },
        );
      document.page.margins.bottom = originalBottomMargin;
    }
    document.end();
    return completed;
  }
}

export function buildAnalyticsReportView(
  input: Pick<AnalyticsReportInput, 'pagePerformance'>,
): AnalyticsReportView {
  const contentPages = input.pagePerformance.filter(
    (page) => !isBlogIndex(page),
  );
  const source = contentPages.length ? contentPages : input.pagePerformance;
  return {
    topPages: source
      .toSorted((left, right) => right.views - left.views)
      .slice(0, 10),
  };
}

function isBlogIndex(page: PagePerformance) {
  if (page.title.trim().toLowerCase() === 'blog') return true;
  if (!page.url) return false;
  try {
    return new URL(page.url).pathname.replace(/\/+$/, '').endsWith('/blog');
  } catch {
    return false;
  }
}

function executiveSummary(input: AnalyticsReportInput) {
  const changes = [
    input.metrics.views
      ? `las vistas ${directionPhrase(input.metrics.views.changePercent)}`
      : null,
    input.metrics.clicks
      ? `los clics orgánicos ${directionPhrase(input.metrics.clicks.changePercent)}`
      : null,
    input.metrics.impressions
      ? `las impresiones ${directionPhrase(input.metrics.impressions.changePercent)}`
      : null,
  ].filter(Boolean) as string[];
  const result = changes.length
    ? changes.join(', ').replace(/, ([^,]*)$/, ' y $1')
    : 'no hay base suficiente para describir la variación';
  return `Durante el periodo analizado, ${result}. La prioridad del siguiente ciclo es convertir estos datos en acciones verificables por nota y mantener separados los ajustes editoriales, la medición y los cambios técnicos del sitio.`;
}

function executiveInsights(input: AnalyticsReportInput) {
  const metrics = input.metrics;
  const insights: string[] = [];
  if (metrics.views || metrics.sessions) {
    insights.push(
      `Consumo: ${metricSentence('vistas', metrics.views)}; ${metricSentence('sesiones', metrics.sessions)}.`,
    );
  }
  if (metrics.clicks || metrics.impressions || metrics.ctr) {
    insights.push(
      `Búsqueda orgánica: ${metricSentence('clics', metrics.clicks)}; ${metricSentence('impresiones', metrics.impressions)}; ${metricSentence('CTR', metrics.ctr, true)}.`,
    );
  }
  if (metrics.engagedSessions || metrics.averageEngagementTime) {
    insights.push(
      `Interacción: ${metricSentence('sesiones con interacción', metrics.engagedSessions)}; ${metricSentence('tiempo medio', metrics.averageEngagementTime)}.`,
    );
  }
  if (metrics.keyEvents) {
    insights.push(
      metrics.keyEvents.current > 0
        ? `Conversión: se registraron ${integer(metrics.keyEvents.current)} eventos clave en el periodo.`
        : 'Conversión: no se registraron eventos clave. Antes de atribuir resultados comerciales, debe validarse la medición del CTA y del formulario en GA4.',
    );
  }
  return insights;
}

function metricSentence(label: string, metric?: Metric, percentage = false) {
  if (!metric) return `${label} sin dato`;
  return `${label} ${percentage ? percent(metric.current) : integer(metric.current)} (${trendLabel(metric, false)})`;
}

function directionPhrase(value: number | null) {
  if (value === null) return 'no tienen base comparable';
  if (Math.abs(value) < 0.05) return 'se mantuvieron estables';
  return `${value > 0 ? 'crecieron' : 'disminuyeron'} ${decimal(Math.abs(value))}%`;
}

function pageInsights(pages: PagePerformance[]) {
  if (!pages.length) {
    return [
      'Aún no hay datos suficientes por nota para establecer prioridades.',
    ];
  }
  const best = pages[0];
  const searchOpportunity = pages
    .filter((page) => page.impressions >= 100)
    .toSorted((left, right) => left.ctr - right.ctr)[0];
  const engagementOpportunity = pages
    .filter((page) => page.sessions >= 5)
    .toSorted((left, right) => left.engagementRate - right.engagementRate)[0];
  return [
    `Mayor consumo: “${best.title}” registró ${integer(best.views)} vistas y ${integer(best.sessions)} sesiones.`,
    ...(searchOpportunity
      ? [
          `Oportunidad de CTR: “${searchOpportunity.title}” acumuló ${integer(searchOpportunity.impressions)} impresiones con ${percent(searchOpportunity.ctr)} de CTR.`,
        ]
      : []),
    ...(engagementOpportunity
      ? [
          `Oportunidad de lectura: “${engagementOpportunity.title}” registró ${percent(engagementOpportunity.engagementRate)} de interacción.`,
        ]
      : []),
  ];
}

function learning(input: AnalyticsReportInput, view: AnalyticsReportView) {
  const best = view.topPages[0];
  return [
    best
      ? `La nota con mayor consumo fue “${best.title}” con ${integer(best.views)} vistas. Se utilizará como referencia de demanda, sin asumir que su estructura fue la causa del resultado.`
      : 'Aún no hay suficiente detalle por nota para identificar patrones de demanda.',
    'Los ajustes editoriales validados durante el flujo se incorporan al criterio de generación y control de futuras notas.',
    `La comparación cubre ${date(input.period.startDate)} al ${date(input.period.endDate)} frente a un periodo equivalente. Las próximas notas deben conservar URL y fecha de publicación confirmadas para medir su evolución sin mezclarla con la portada del blog.`,
  ];
}

function metricGrid(metrics: Record<string, Metric>) {
  const keys = [
    'views',
    'sessions',
    'clicks',
    'impressions',
    'ctr',
    'averagePosition',
  ];
  const cells = keys.map((key) => metricCell(key, metrics[key]));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [3_250, 3_250, 3_250],
    borders: tableBorders(colors.line, 5),
    rows: [
      new TableRow({ cantSplit: true, children: cells.slice(0, 3) }),
      new TableRow({ cantSplit: true, children: cells.slice(3, 6) }),
    ],
  });
}

function metricCell(key: string, metric?: Metric) {
  const fill =
    key === 'views' || key === 'clicks'
      ? colors.paleTeal
      : key === 'impressions' || key === 'averagePosition'
        ? colors.paleAmber
        : colors.paleBlue;
  return new TableCell({
    width: { size: 33, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill },
    margins: { top: 160, bottom: 160, left: 170, right: 170 },
    children: [
      new Paragraph({
        spacing: { after: 55 },
        children: [
          new TextRun({
            text: (labels[key] ?? key).toUpperCase(),
            bold: true,
            size: 15,
            color: colors.muted,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 35 },
        children: [
          new TextRun({
            text: metric ? metricValue(key, metric.current) : 'Sin dato',
            bold: true,
            size: 31,
            color: colors.navy,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: metric ? trendLabel(metric, key === 'averagePosition') : '',
            bold: true,
            size: 16,
            color: metricTrendColor(metric, key === 'averagePosition'),
          }),
        ],
      }),
    ],
  });
}

function monthlyTable(input: AnalyticsReportInput) {
  return reportTable(
    ['Mes', 'Vistas', 'Sesiones', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    input.monthly.map((row) => [
      titleCase(month(row.month)),
      integer(row.views),
      integer(row.sessions),
      integer(row.clicks),
      integer(row.impressions),
      percent(row.ctr),
      decimal(row.position),
    ]),
    [2_200, 1_150, 1_250, 1_050, 1_450, 1_100, 1_250],
    16,
  );
}

function topPagesTable(pages: PagePerformance[]) {
  return reportTable(
    ['Nota', 'Vistas', 'Sesiones', 'Clics', 'CTR', 'Posición'],
    pages.map((page) => [
      truncate(page.title, 92),
      integer(page.views),
      integer(page.sessions),
      integer(page.clicks),
      percent(page.ctr),
      decimal(page.position),
    ]),
    [4_800, 1_000, 1_100, 900, 1_000, 1_100],
    16,
  );
}

function actionItem(
  item: AnalyticsActionPlanItem,
  index: number,
  clientName: string,
): Array<Paragraph | Table> {
  return [
    heading(`${index + 1}. ${item.front}`, 2),
    paragraph(
      `${item.priority} | ${actionStatus(item.status)} | Fecha objetivo ${date(item.dueDate)}`,
      { bold: true, color: actionColor(item.status), after: 90 },
    ),
    reportTable(
      ['Responsable', 'Acción'],
      [
        [item.moodOwner, item.moodAction],
        [clientOwner(item, clientName), item.clientAction],
      ],
      [2_650, 7_250],
      17,
    ),
    paragraph(`Dependencia: ${item.dependency}`, {
      color: colors.muted,
      size: 18,
      before: 80,
      after: 40,
    }),
    paragraph(`Cómo se valida: ${item.validation}`, {
      color: colors.muted,
      size: 18,
      after: 130,
    }),
  ];
}

function reportTable(
  headers: string[],
  rows: string[][],
  widths: number[],
  fontSize: number,
) {
  const tableRows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: headers.map(
        (header, index) =>
          new TableCell({
            width: { size: widths[index], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { type: ShadingType.CLEAR, fill: colors.navy },
            margins: { top: 115, bottom: 115, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: index ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: header,
                    bold: true,
                    size: fontSize,
                    color: colors.white,
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
                  fill: rowIndex % 2 ? colors.paleGray : colors.white,
                },
                margins: { top: 115, bottom: 115, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    alignment: index
                      ? AlignmentType.CENTER
                      : AlignmentType.LEFT,
                    spacing: { line: 240 },
                    children: [
                      new TextRun({
                        text: value,
                        bold: index === 0,
                        size: fontSize,
                        color: colors.ink,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    borders: tableBorders(colors.line, 5),
    rows: tableRows,
  });
}

function tableBorders(color: string, size: number) {
  const border = { style: BorderStyle.SINGLE, size, color };
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border,
  };
}

function kicker(text: string) {
  return new Paragraph({
    spacing: { after: 180 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: colors.teal,
        size: 19,
        characterSpacing: 20,
      }),
    ],
  });
}

function title(text: string) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 150, line: 520 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: '000000',
        size: 53,
        font: 'Arial',
      }),
    ],
  });
}

function lead(text: string, size: number, bold = false, after = 90) {
  return new Paragraph({
    spacing: { after, line: 300 },
    children: [new TextRun({ text, size, bold, color: colors.muted })],
  });
}

function heading(text: string, level: 1 | 2 = 1) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: [new TextRun({ text, color: '000000', bold: true })],
  });
}

function paragraph(
  text: string,
  options: {
    size?: number;
    color?: string;
    bold?: boolean;
    before?: number;
    after?: number;
  } = {},
) {
  return new Paragraph({
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 105,
      line: 270,
    },
    children: [
      new TextRun({
        text,
        size: options.size,
        color: options.color ?? colors.ink,
        bold: options.bold,
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    numbering: { reference: 'report-bullet', level: 0 },
    children: [new TextRun(text)],
  });
}

function footer(clientName: string) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `Mood | ${clientName} | Página `,
            color: colors.muted,
            size: 16,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            color: colors.muted,
            size: 16,
          }),
        ],
      }),
    ],
  });
}

function pdfCover(document: PDFKit.PDFDocument, input: AnalyticsReportInput) {
  const width = document.page.width - 96;
  document.y = 90;
  document
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(`#${colors.teal}`)
    .text('MOOD | INFORME MENSUAL', 48, document.y, {
      width,
      characterSpacing: 1.1,
    });
  document
    .moveDown(2.2)
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor('#000000')
    .text('Informe mensual SEO GEO y AEO del blog', { width, lineGap: 3 });
  document
    .moveDown(0.7)
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(`#${colors.navy}`)
    .text(input.clientName);
  document
    .moveDown(0.5)
    .font('Helvetica')
    .fontSize(12)
    .fillColor(`#${colors.muted}`)
    .text(`${date(input.period.startDate)} al ${date(input.period.endDate)}`);
  document
    .moveDown(0.3)
    .fontSize(9.5)
    .text(
      `Comparación con ${date(input.period.comparisonStartDate)} al ${date(input.period.comparisonEndDate)}`,
    );
  document
    .moveDown(0.3)
    .text(
      `Preparado el ${date(input.generatedAt)} | Última sincronización ${dateTime(input.lastSyncCompletedAt)}`,
    );
  document
    .moveDown(4)
    .font('Helvetica')
    .fontSize(13)
    .fillColor(`#${colors.ink}`)
    .text(
      'Este informe resume el rendimiento del blog, las decisiones recomendadas y las responsabilidades de Mood y Adecco Perú para el siguiente periodo.',
      { width: width * 0.82, lineGap: 5 },
    );
}

function pdfMetricGrid(
  document: PDFKit.PDFDocument,
  metrics: Record<string, Metric>,
) {
  const keys = [
    'views',
    'sessions',
    'clicks',
    'impressions',
    'ctr',
    'averagePosition',
  ];
  const startX = 48;
  const startY = document.y + 18;
  const gap = 10;
  const width = (document.page.width - 96 - gap * 2) / 3;
  const height = 76;
  keys.forEach((key, index) => {
    const metric = metrics[key];
    const x = startX + (index % 3) * (width + gap);
    const y = startY + Math.floor(index / 3) * (height + gap);
    const fill =
      key === 'views' || key === 'clicks'
        ? colors.paleTeal
        : key === 'impressions' || key === 'averagePosition'
          ? colors.paleAmber
          : colors.paleBlue;
    document
      .roundedRect(x, y, width, height, 6)
      .fillAndStroke(`#${fill}`, `#${colors.line}`);
    document
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(`#${colors.muted}`)
      .text((labels[key] ?? key).toUpperCase(), x + 12, y + 11, {
        width: width - 24,
      });
    document
      .font('Helvetica-Bold')
      .fontSize(17)
      .fillColor(`#${colors.navy}`)
      .text(
        metric ? metricValue(key, metric.current) : 'Sin dato',
        x + 12,
        y + 28,
        {
          width: width - 24,
        },
      );
    document
      .font('Helvetica-Bold')
      .fontSize(7.2)
      .fillColor(`#${metricTrendColor(metric, key === 'averagePosition')}`)
      .text(
        metric ? trendLabel(metric, key === 'averagePosition') : '',
        x + 12,
        y + 56,
        {
          width: width - 24,
        },
      );
  });
  document.x = 48;
  document.y = startY + height * 2 + gap + 8;
}

function pdfActionItem(
  document: PDFKit.PDFDocument,
  item: AnalyticsActionPlanItem,
  index: number,
  clientName: string,
) {
  const lines = [
    `${index + 1}. ${item.front}`,
    `${item.priority} | ${actionStatus(item.status)} | Fecha objetivo ${date(item.dueDate)}`,
    `${item.moodOwner}: ${item.moodAction}`,
    `${clientOwner(item, clientName)}: ${item.clientAction}`,
    `Dependencia: ${item.dependency}`,
    `Cómo se valida: ${item.validation}`,
  ];
  const estimated = lines.reduce(
    (sum, line) =>
      sum +
      document.heightOfString(line, {
        width: document.page.width - 96,
        lineGap: 3,
      }),
    0,
  );
  ensurePdfSpace(document, estimated + 52);
  pdfSubsection(document, lines[0]);
  pdfText(document, lines[1], actionColor(item.status), 8.6, 2, true);
  lines.slice(2).forEach((line) => pdfText(document, line, colors.ink, 9, 3));
  document.moveDown(0.55);
}

function pdfTable(
  document: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
  alignments: Array<'left' | 'center' | 'right'>,
  fontSize: number,
) {
  const startX = 48;
  const padding = 6;
  const drawHeader = () => {
    const top = document.y + 8;
    const height = 28;
    let x = startX;
    headers.forEach((header, index) => {
      document
        .rect(x, top, widths[index], height)
        .fillAndStroke(`#${colors.navy}`, `#${colors.navy}`);
      document
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .fillColor(`#${colors.white}`)
        .text(header, x + padding, top + 9, {
          width: widths[index] - padding * 2,
          align: alignments[index],
          lineBreak: false,
        });
      x += widths[index];
    });
    document.y = top + height;
  };
  ensurePdfSpace(document, 50);
  drawHeader();
  rows.forEach((row, rowIndex) => {
    document.font('Helvetica').fontSize(fontSize);
    const textHeights = row.map((value, index) =>
      document.heightOfString(value, {
        width: widths[index] - padding * 2,
        lineGap: 2,
      }),
    );
    const height = Math.max(28, Math.max(...textHeights) + padding * 2);
    if (document.y + height > pdfBottom(document)) {
      document.addPage();
      drawHeader();
    }
    const top = document.y;
    let x = startX;
    row.forEach((value, index) => {
      document
        .rect(x, top, widths[index], height)
        .fillAndStroke(
          rowIndex % 2 ? `#${colors.paleGray}` : `#${colors.white}`,
          `#${colors.line}`,
        );
      document
        .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor(`#${colors.ink}`)
        .text(value, x + padding, top + padding, {
          width: widths[index] - padding * 2,
          align: alignments[index],
          lineGap: 2,
        });
      x += widths[index];
    });
    document.y = top + height;
  });
  document.x = 48;
  document.y += 10;
}

function pdfSection(document: PDFKit.PDFDocument, text: string) {
  ensurePdfSpace(document, 58);
  document
    .moveDown(0.8)
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor('#000000')
    .text(text, 48, document.y, {
      width: document.page.width - 96,
      lineGap: 2,
    });
  document.moveDown(0.25);
}

function pdfSubsection(document: PDFKit.PDFDocument, text: string) {
  ensurePdfSpace(document, 42);
  document
    .moveDown(0.75)
    .font('Helvetica-Bold')
    .fontSize(11.5)
    .fillColor('#000000')
    .text(text, 48, document.y, {
      width: document.page.width - 96,
      lineGap: 2,
    });
}

function pdfText(
  document: PDFKit.PDFDocument,
  text: string,
  color = colors.ink,
  size = 9.5,
  lineGap = 3,
  bold = false,
) {
  const width = document.page.width - 96;
  const height = document.heightOfString(text, { width, lineGap }) + 10;
  ensurePdfSpace(document, height);
  document
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(`#${color}`)
    .text(text, 48, document.y, { width, lineGap, paragraphGap: 4 });
}

function pdfBullet(document: PDFKit.PDFDocument, text: string) {
  const width = document.page.width - 120;
  const height = document.heightOfString(text, { width, lineGap: 3 }) + 10;
  ensurePdfSpace(document, height);
  const top = document.y + 2;
  document
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(`#${colors.teal}`)
    .text('-', 54, top, { width: 10, lineBreak: false });
  document
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(`#${colors.ink}`)
    .text(text, 68, top, { width, lineGap: 3, paragraphGap: 4 });
  document.y += 3;
}

function ensurePdfSpace(document: PDFKit.PDFDocument, required: number) {
  if (document.y + required > pdfBottom(document)) document.addPage();
}

function pdfBottom(document: PDFKit.PDFDocument) {
  return document.page.height - document.page.margins.bottom - 20;
}

const labels: Record<string, string> = {
  views: 'Vistas',
  sessions: 'Sesiones',
  activeUsers: 'Usuarios activos',
  engagedSessions: 'Sesiones con interacción',
  averageEngagementTime: 'Tiempo medio de interacción',
  keyEvents: 'Conversiones registradas',
  clicks: 'Clics orgánicos',
  impressions: 'Impresiones',
  ctr: 'CTR',
  averagePosition: 'Posición media',
};

function metricValue(key: string, value: number) {
  if (key === 'ctr') return percent(value);
  if (key === 'averagePosition') return decimal(value);
  if (key === 'averageEngagementTime') return `${decimal(value)} s`;
  return integer(value);
}

function trendLabel(metric: Metric, lowerIsBetter: boolean) {
  if (metric.changePercent === null) return 'Sin base comparable';
  if (Math.abs(metric.changePercent) < 0.05) return 'Sin variación relevante';
  const improved = lowerIsBetter
    ? metric.current < metric.previous
    : metric.current > metric.previous;
  return `${improved ? 'Mejora' : 'Retroceso'} de ${decimal(Math.abs(metric.changePercent))}%`;
}

function metricTrendColor(metric: Metric | undefined, lowerIsBetter: boolean) {
  if (!metric || metric.changePercent === null) return colors.muted;
  if (Math.abs(metric.changePercent) < 0.05) return colors.muted;
  const improved = lowerIsBetter
    ? metric.current < metric.previous
    : metric.current > metric.previous;
  return improved ? colors.teal : colors.coral;
}

function cleanMethodology(value: string, source: string) {
  const cleaned = value.trim().replace(/[.\s]+$/, '');
  if (!cleaned) return `${source}: sin detalle disponible.`;
  return cleaned.toLowerCase().startsWith(source.toLowerCase())
    ? `${cleaned}.`
    : `${source}: ${cleaned}.`;
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
  return `${(value * 100).toLocaleString('es-PE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

function actionStatus(value: AnalyticsActionPlanItem['status']) {
  return {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En progreso',
    VALIDATED: 'Validada',
    DISMISSED: 'Descartada',
  }[value];
}

function actionColor(value: AnalyticsActionPlanItem['status']) {
  return value === 'VALIDATED'
    ? colors.teal
    : value === 'DISMISSED'
      ? colors.muted
      : colors.coral;
}

function clientOwner(item: AnalyticsActionPlanItem, clientName: string) {
  return item.clientOwner.replace('del cliente', `de ${clientName}`);
}

function titleCase(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum
    ? value
    : `${value.slice(0, Math.max(0, maximum - 3)).trim()}...`;
}
