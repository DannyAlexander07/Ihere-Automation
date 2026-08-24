import { Injectable, Logger } from '@nestjs/common';
import {
  AuditActorType,
  ExportStatus,
  NoteStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { ExportBlock, ExportInput } from './export-types';
import { ExportRendererService } from './export-renderer.service';
import { ExportStorageService } from './export-storage.service';

@Injectable()
export class ExportProcessorService {
  private readonly logger = new Logger(ExportProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: ExportRendererService,
    private readonly storage: ExportStorageService,
  ) {}

  async process(artifactId: string, deadline: number) {
    const artifact = await this.prisma.exportArtifact.findUnique({
      where: { id: artifactId },
      include: { note: true },
    });
    if (!artifact) throw new Error('La exportación no existe.');
    if (artifact.status === ExportStatus.READY) {
      return { artifactId, status: 'already-completed' };
    }
    if (artifact.status === ExportStatus.INVALID) {
      return { artifactId, status: 'invalid' };
    }
    if (
      artifact.note.currentVersion !== artifact.version ||
      (artifact.note.status !== NoteStatus.APPROVED &&
        artifact.note.status !== NoteStatus.EXPORTED)
    ) {
      await this.invalidateObsolete(artifactId, artifact.note);
      return { artifactId, status: 'invalid-obsolete-version' };
    }
    const claimed = await this.prisma.exportArtifact.updateMany({
      where: { id: artifactId, status: ExportStatus.QUEUED },
      data: {
        status: ExportStatus.GENERATING,
        errorMessage: null,
        fileName: null,
        storageKey: null,
        mimeType: null,
        sizeBytes: null,
        contentHash: null,
      },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.exportArtifact.findUnique({
        where: { id: artifactId },
        select: { status: true },
      });
      return {
        artifactId,
        status:
          current?.status === ExportStatus.READY
            ? 'already-completed'
            : 'already-running',
      };
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: artifact.note.tenantId,
        clientId: artifact.note.clientId,
        actorType: AuditActorType.SYSTEM,
        action: 'note.export.started',
        entityType: 'export_artifact',
        entityId: artifactId,
        metadata: {
          noteId: artifact.noteId,
          version: artifact.version,
          format: artifact.format,
        },
      },
    });

    this.assertWithinDeadline(deadline);
    const input = await this.loadInput(artifact);
    const rendered = await this.renderer.render(input);
    this.assertWithinDeadline(deadline);
    this.assertValidArtifact(rendered.buffer, rendered.extension);
    const fileName = this.fileName(
      input.title,
      input.slug,
      input.version,
      rendered.extension,
    );
    const storageKey = `${input.tenantId}/${input.clientId}/${input.noteId}/v${input.version}/${artifactId}-${fileName}`;
    await this.storage.write(storageKey, rendered.buffer);
    this.assertWithinDeadline(deadline);
    const contentHash = this.storage.hash(rendered.buffer);

    await this.prisma.$transaction(async (tx) => {
      const completed = await tx.exportArtifact.updateMany({
        where: { id: artifactId, status: ExportStatus.GENERATING },
        data: {
          status: ExportStatus.READY,
          fileName,
          storageKey,
          mimeType: rendered.mimeType,
          sizeBytes: rendered.buffer.byteLength,
          contentHash,
          errorMessage: null,
        },
      });
      if (completed.count !== 1) {
        throw new Error('La exportación cambió antes de finalizar.');
      }
      await tx.noteDocument.updateMany({
        where: {
          id: artifact.noteId,
          currentVersion: artifact.version,
          status: { in: [NoteStatus.APPROVED, NoteStatus.EXPORTED] },
        },
        data: { status: NoteStatus.EXPORTED },
      });
      await tx.auditLog.create({
        data: {
          tenantId: artifact.note.tenantId,
          clientId: artifact.note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.export.completed',
          entityType: 'export_artifact',
          entityId: artifactId,
          after: {
            status: ExportStatus.READY,
            fileName,
            mimeType: rendered.mimeType,
            sizeBytes: rendered.buffer.byteLength,
            contentHash,
          },
          metadata: {
            noteId: artifact.noteId,
            version: artifact.version,
            format: artifact.format,
          },
        },
      });
    });
    this.logger.log(
      `Exportación ${artifactId} completada (${artifact.format}, ${rendered.buffer.byteLength} bytes).`,
    );
    return {
      artifactId,
      status: ExportStatus.READY,
      fileName,
      contentHash,
    };
  }

  async recordFailure(
    artifactId: string,
    error: Error,
    finalAttempt: boolean,
    attempt: number,
  ) {
    const artifact = await this.prisma.exportArtifact.findUnique({
      where: { id: artifactId },
      include: { note: true },
    });
    if (!artifact || artifact.status === ExportStatus.READY) return;
    const message = error.message.slice(0, 2_000);
    await this.prisma.$transaction([
      this.prisma.exportArtifact.update({
        where: { id: artifactId },
        data: {
          status: finalAttempt ? ExportStatus.FAILED : ExportStatus.QUEUED,
          errorMessage: finalAttempt
            ? `Falló después de ${attempt} intento(s): ${message}`
            : `El intento ${attempt} falló y será reintentado.`,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: artifact.note.tenantId,
          clientId: artifact.note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: finalAttempt
            ? 'note.export.failed'
            : 'note.export.retry_scheduled',
          entityType: 'export_artifact',
          entityId: artifactId,
          metadata: {
            noteId: artifact.noteId,
            version: artifact.version,
            format: artifact.format,
            attempt,
            error: message,
          },
        },
      }),
    ]);
  }

  private async loadInput(artifact: {
    noteId: string;
    version: number;
    format: ExportInput['format'];
    note: { tenantId: string; clientId: string };
  }): Promise<ExportInput> {
    const version = await this.prisma.noteVersion.findUnique({
      where: {
        noteId_version: { noteId: artifact.noteId, version: artifact.version },
      },
      include: {
        sources: { orderBy: { accessedAt: 'desc' } },
        note: { include: { client: { select: { name: true } } } },
      },
    });
    if (!version) throw new Error('La versión aprobada no existe.');
    const content = version.content as Record<string, unknown>;
    const blocks = Array.isArray(content.blocks)
      ? (content.blocks as ExportBlock[])
      : [];
    const internalLinks = Array.isArray(version.internalLinks)
      ? version.internalLinks.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    return {
      format: artifact.format,
      tenantId: artifact.note.tenantId,
      clientId: artifact.note.clientId,
      clientName: version.note.client.name,
      noteId: artifact.noteId,
      version: artifact.version,
      title: version.title,
      metaTitle: version.metaTitle,
      metaDescription: version.metaDescription,
      slug: version.slug,
      excerpt: version.excerpt,
      authorName: version.authorName,
      authorRole: version.authorRole,
      ctaText: version.ctaText,
      ctaUrl: version.ctaUrl,
      internalLinks,
      blocks,
      sources: version.sources,
    };
  }

  private assertValidArtifact(
    buffer: Buffer,
    extension: 'html' | 'docx' | 'pdf',
  ) {
    if (!buffer.byteLength || buffer.byteLength > 25_000_000) {
      throw new Error('El archivo generado tiene un tamaño inválido.');
    }
    if (
      extension === 'html' &&
      (!buffer
        .subarray(0, 100)
        .toString('utf8')
        .toLowerCase()
        .includes('<!doctype html>') ||
        !buffer.toString('utf8').includes('</html>'))
    ) {
      throw new Error('El HTML generado está incompleto.');
    }
    if (
      extension === 'docx' &&
      (buffer.byteLength < 2_000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    ) {
      throw new Error('El DOCX generado no tiene una estructura válida.');
    }
    if (
      extension === 'pdf' &&
      (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
        !buffer.subarray(-1_024).toString('latin1').includes('%%EOF'))
    ) {
      throw new Error('El PDF generado no tiene una estructura válida.');
    }
  }

  private fileName(
    title: string,
    slug: string | null,
    version: number,
    extension: string,
  ) {
    const base =
      (slug || title)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'nota';
    return `${base}-v${version}.${extension}`;
  }

  private async invalidateObsolete(
    artifactId: string,
    note: { id: string; tenantId: string; clientId: string },
  ) {
    await this.prisma.$transaction([
      this.prisma.exportArtifact.update({
        where: { id: artifactId },
        data: {
          status: ExportStatus.INVALID,
          errorMessage:
            'La nota cambió de versión o dejó de estar aprobada antes de generar el archivo.',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: note.tenantId,
          clientId: note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.export.invalidated_obsolete',
          entityType: 'export_artifact',
          entityId: artifactId,
          metadata: { noteId: note.id },
        },
      }),
    ]);
  }

  private assertWithinDeadline(deadline: number) {
    if (Date.now() > deadline) {
      throw new Error('La exportación excedió el tiempo máximo permitido.');
    }
  }
}
