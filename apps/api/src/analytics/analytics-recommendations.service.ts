import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsRecommendationStatus } from '../generated/prisma/client';

type Page = {
  pagePath: string;
  url: string | null;
  title: string;
  sessions: number;
  engagementRate: number;
  keyEvents: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Publication = {
  id: string;
  title: string;
  url: string;
  validationStatus: string;
  validationMessage: string | null;
};

type Candidate = {
  fingerprint: string;
  code: string;
  title: string;
  detail: string;
  targetUrl: string | null;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
};

@Injectable()
export class AnalyticsRecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile(input: {
    tenantId: string;
    clientId: string;
    reportEnd: string;
    pages: Page[];
    publications: Publication[];
  }) {
    const reportEnd = new Date(`${input.reportEnd}T00:00:00.000Z`);
    const candidates = buildCandidates(input.pages, input.publications);
    for (const candidate of candidates) {
      const existing = await this.prisma.analyticsRecommendation.findUnique({
        where: {
          clientId_fingerprint: {
            clientId: input.clientId,
            fingerprint: candidate.fingerprint,
          },
        },
      });
      if (!existing) {
        await this.prisma.analyticsRecommendation.create({
          data: {
            tenantId: input.tenantId,
            clientId: input.clientId,
            ...candidate,
            firstReportEnd: reportEnd,
            lastReportEnd: reportEnd,
          },
        });
        continue;
      }
      if (reportEnd <= existing.lastReportEnd) continue;
      await this.prisma.analyticsRecommendation.update({
        where: { id: existing.id },
        data: {
          ...candidate,
          status: AnalyticsRecommendationStatus.OPEN,
          observationCount: { increment: 1 },
          lastReportEnd: reportEnd,
          implementationNote: null,
          implementedAt: null,
        },
      });
    }
    return this.list(input.tenantId, input.clientId);
  }

  list(tenantId: string, clientId: string) {
    return this.prisma.analyticsRecommendation.findMany({
      where: { tenantId, clientId },
      select: {
        id: true,
        code: true,
        title: true,
        detail: true,
        targetUrl: true,
        priority: true,
        status: true,
        observationCount: true,
        firstReportEnd: true,
        lastReportEnd: true,
        implementationNote: true,
        implementedAt: true,
      },
      orderBy: [
        { status: 'asc' },
        { observationCount: 'desc' },
        { priority: 'asc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async update(
    tenantId: string,
    clientId: string,
    id: string,
    status: AnalyticsRecommendationStatus,
    note: string,
  ) {
    const current = await this.prisma.analyticsRecommendation.findFirst({
      where: { id, tenantId, clientId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Recomendación no encontrada.');
    return this.prisma.analyticsRecommendation.update({
      where: { id },
      data: {
        status,
        implementationNote: note.trim(),
        implementedAt:
          status === AnalyticsRecommendationStatus.IMPLEMENTED
            ? new Date()
            : null,
      },
    });
  }
}

export function buildCandidates(
  pages: Page[],
  publications: Publication[],
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const publication of publications) {
    if (
      !['BROKEN', 'ERROR', 'REVIEW', 'REDIRECTED'].includes(
        publication.validationStatus,
      )
    )
      continue;
    candidates.push(
      candidate(
        `publication:${publication.id}:${publication.validationStatus}`,
        'PUBLICATION_URL',
        `Revisar URL publicada: ${publication.title}`,
        publication.validationMessage ??
          `La URL figura como ${publication.validationStatus.toLowerCase()}. Confirma la URL canónica antes del siguiente reporte.`,
        publication.url,
        ['BROKEN', 'ERROR'].includes(publication.validationStatus)
          ? 'ALTA'
          : 'MEDIA',
      ),
    );
  }
  for (const page of pages) {
    const target = page.url ?? page.pagePath;
    if (page.impressions >= 100 && page.ctr < 0.02) {
      candidates.push(
        candidate(
          `low-ctr:${page.pagePath}`,
          'LOW_CTR',
          `Mejorar CTR: ${page.title}`,
          `Registra ${page.impressions.toLocaleString('es-PE')} impresiones y ${(page.ctr * 100).toFixed(2)}% de CTR. Revisar title, meta description y correspondencia con la intención.`,
          target,
          'ALTA',
        ),
      );
    }
    if (page.sessions >= 20 && page.engagementRate < 0.4) {
      candidates.push(
        candidate(
          `low-engagement:${page.pagePath}`,
          'LOW_ENGAGEMENT',
          `Mejorar lectura: ${page.title}`,
          `La tasa de interacción es ${(page.engagementRate * 100).toFixed(1)}%. Reforzar la respuesta inicial, escaneabilidad, enlaces internos y siguiente paso.`,
          target,
          'MEDIA',
        ),
      );
    }
    if (page.sessions >= 20 && page.keyEvents === 0) {
      candidates.push(
        candidate(
          `no-key-events:${page.pagePath}`,
          'NO_KEY_EVENTS',
          `Validar conversión: ${page.title}`,
          'La nota tiene sesiones pero no registra eventos clave. Verificar el CTA y la medición del enlace hacia contacto.',
          target,
          'ALTA',
        ),
      );
    }
    if (page.impressions >= 100 && page.position >= 8 && page.position <= 20) {
      candidates.push(
        candidate(
          `near-page-one:${page.pagePath}`,
          'NEAR_PAGE_ONE',
          `Oportunidad de posicionamiento: ${page.title}`,
          `La posición media es ${page.position.toFixed(1)}. Ampliar respuestas, entidades y enlaces internos para competir por primera página.`,
          target,
          'MEDIA',
        ),
      );
    }
  }
  return candidates;
}

function candidate(
  key: string,
  code: string,
  title: string,
  detail: string,
  targetUrl: string | null,
  priority: Candidate['priority'],
): Candidate {
  return {
    fingerprint: createHash('sha256').update(key).digest('hex'),
    code,
    title,
    detail,
    targetUrl,
    priority,
  };
}
