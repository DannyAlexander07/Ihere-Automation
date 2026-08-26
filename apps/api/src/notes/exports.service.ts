import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import {
  clientIdsForPermission,
  hasPermission,
} from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import {
  AuditActorType,
  ExportFormat,
  ExportStatus,
  NoteStatus,
  OutboxJobStatus,
  Prisma,
} from '../generated/prisma/client';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportDispatchDto } from './dto/export-dispatch.dto';
import { VerifyExportDto } from './dto/verify-export.dto';
import { EXPORT_JOB } from './export-queue.service';
import { ExportStorageService } from './export-storage.service';

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ExportStorageService,
  ) {}

  async list(principal: AuthPrincipal) {
    const tenantWide = principal.tenantPermissions.includes('notes.export');
    return this.prisma.exportArtifact.findMany({
      where: {
        ...(principal.tenantPermissions.includes('notes.export_html')
          ? {}
          : { format: { not: ExportFormat.HTML } }),
        note: {
          tenantId: principal.tenantId,
          ...(tenantWide
            ? {}
            : {
                clientId: {
                  in: clientIdsForPermission(principal, 'notes.export'),
                },
              }),
        },
      },
      select: {
        id: true,
        noteId: true,
        version: true,
        format: true,
        status: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        contentHash: true,
        errorMessage: true,
        verifiedAt: true,
        sentToEmail: true,
        sentByEmail: true,
        emailSubject: true,
        externalMessageId: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
        note: {
          select: {
            status: true,
            client: { select: { name: true, slug: true } },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { title: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async request(
    noteId: string,
    input: CreateExportDto,
    principal: AuthPrincipal,
  ) {
    this.assertFormatPermission(principal, input.format);
    const note = await this.prisma.noteDocument.findFirst({
      where: { id: noteId, tenantId: principal.tenantId },
    });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    this.assertClientPermission(principal, note.clientId);
    if (
      note.status !== NoteStatus.APPROVED &&
      note.status !== NoteStatus.EXPORTED
    ) {
      throw new ConflictException(
        'Solo una versión aprobada puede exportarse.',
      );
    }
    if (note.currentVersion !== input.expectedVersion) {
      throw new ConflictException(
        'La versión cambió. Recarga antes de generar el entregable.',
      );
    }

    const existing = await this.prisma.exportArtifact.findUnique({
      where: {
        noteId_version_format: {
          noteId,
          version: input.expectedVersion,
          format: input.format,
        },
      },
    });
    if (existing?.status === ExportStatus.READY) return existing;
    if (
      existing &&
      (existing.status === ExportStatus.QUEUED ||
        existing.status === ExportStatus.GENERATING)
    ) {
      return existing;
    }
    if (existing) {
      return this.prisma.$transaction(async (tx) => {
        const artifact = await tx.exportArtifact.update({
          where: { id: existing.id },
          data: {
            status: ExportStatus.QUEUED,
            fileName: null,
            storageKey: null,
            mimeType: null,
            sizeBytes: null,
            contentHash: null,
            errorMessage: null,
            verifiedById: null,
            verifiedAt: null,
          },
        });
        await tx.outboxJob.update({
          where: {
            jobType_aggregateType_aggregateId: {
              jobType: EXPORT_JOB,
              aggregateType: 'export_artifact',
              aggregateId: artifact.id,
            },
          },
          data: {
            status: OutboxJobStatus.PENDING,
            attempts: 0,
            availableAt: new Date(),
            dispatchedAt: null,
            lastError: null,
            payload: { artifactId: artifact.id, dispatchId: randomUUID() },
          },
        });
        await this.auditQueued(tx, artifact.id, note, principal, input);
        return artifact;
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const artifact = await tx.exportArtifact.create({
          data: {
            noteId,
            version: input.expectedVersion,
            format: input.format,
            createdById: principal.userId,
          },
        });
        const outbox = await tx.outboxJob.create({
          data: {
            tenantId: principal.tenantId,
            jobType: EXPORT_JOB,
            aggregateType: 'export_artifact',
            aggregateId: artifact.id,
            payload: { artifactId: artifact.id, dispatchId: randomUUID() },
          },
        });
        await this.auditQueued(
          tx,
          artifact.id,
          note,
          principal,
          input,
          outbox.id,
        );
        return artifact;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.exportArtifact.findUnique({
          where: {
            noteId_version_format: {
              noteId,
              version: input.expectedVersion,
              format: input.format,
            },
          },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async download(id: string, principal: AuthPrincipal) {
    const artifact = await this.prisma.exportArtifact.findFirst({
      where: { id, note: { tenantId: principal.tenantId } },
      include: { note: true },
    });
    if (!artifact) throw new NotFoundException('Exportación no encontrada.');
    this.assertFormatPermission(principal, artifact.format);
    this.assertClientPermission(principal, artifact.note.clientId);
    if (
      artifact.status !== ExportStatus.READY ||
      !artifact.storageKey ||
      !artifact.fileName ||
      !artifact.mimeType ||
      !artifact.contentHash
    ) {
      throw new ConflictException(
        'El archivo todavía no está listo para descargar.',
      );
    }
    let buffer: Buffer;
    try {
      buffer = await this.storage.read(artifact.storageKey);
    } catch {
      await this.invalidate(
        artifact.id,
        artifact.note,
        'El archivo no existe en el almacenamiento.',
      );
      throw new ConflictException(
        'El archivo no está disponible y quedó marcado para regeneración.',
      );
    }
    const hash = this.storage.hash(buffer);
    if (
      hash !== artifact.contentHash ||
      buffer.byteLength !== artifact.sizeBytes
    ) {
      await this.invalidate(
        artifact.id,
        artifact.note,
        'La integridad del archivo no coincide con el registro.',
      );
      throw new ConflictException(
        'La verificación de integridad falló. Regenera el archivo.',
      );
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        clientId: artifact.note.clientId,
        userId: principal.userId,
        actorType: AuditActorType.USER,
        action: 'note.export.downloaded',
        entityType: 'export_artifact',
        entityId: artifact.id,
        requestId: principal.requestId,
        ipAddress: principal.ipAddress,
        userAgent: principal.userAgent,
        metadata: {
          noteId: artifact.noteId,
          version: artifact.version,
          format: artifact.format,
        },
      },
    });
    return {
      buffer,
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      contentHash: artifact.contentHash,
    };
  }

  async markDispatched(
    id: string,
    input: ExportDispatchDto,
    principal: AuthPrincipal,
  ) {
    const artifact = await this.prisma.exportArtifact.findFirst({
      where: { id, note: { tenantId: principal.tenantId } },
      include: { note: true },
    });
    if (!artifact) throw new NotFoundException('Exportación no encontrada.');
    this.assertFormatPermission(principal, artifact.format);
    this.assertClientPermission(principal, artifact.note.clientId);
    if (artifact.status !== ExportStatus.READY || !artifact.verifiedAt) {
      throw new ConflictException(
        'Solo un archivo verificado puede registrarse como enviado.',
      );
    }
    const senderEmail = input.senderEmail.trim().toLowerCase();
    const recipientEmail = input.recipientEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { email: true },
    });
    if (user?.email && user.email.toLowerCase() !== senderEmail) {
      throw new ForbiddenException(
        'El remitente debe coincidir con el correo corporativo de tu cuenta.',
      );
    }
    const sentAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exportArtifact.update({
        where: { id },
        data: {
          sentToEmail: recipientEmail,
          sentByEmail: senderEmail,
          emailSubject: input.subject.trim(),
          externalMessageId: input.externalMessageId?.trim() || null,
          sentAt,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: artifact.note.clientId,
          userId: principal.userId,
          actorType: AuditActorType.USER,
          action: 'note.export.email.sent_confirmed',
          entityType: 'export_artifact',
          entityId: artifact.id,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          after: {
            sentToEmail: recipientEmail,
            sentByEmail: senderEmail,
            subject: input.subject.trim(),
            sentAt: sentAt.toISOString(),
          },
          metadata: {
            noteId: artifact.noteId,
            version: artifact.version,
            format: artifact.format,
            externalMessageId: input.externalMessageId?.trim() || null,
          },
        },
      });
      return updated;
    });
  }

  async verify(id: string, input: VerifyExportDto, principal: AuthPrincipal) {
    const artifact = await this.prisma.exportArtifact.findFirst({
      where: { id, note: { tenantId: principal.tenantId } },
      include: { note: true },
    });
    if (!artifact) throw new NotFoundException('Exportación no encontrada.');
    this.assertFormatPermission(principal, artifact.format);
    this.assertClientPermission(principal, artifact.note.clientId);
    if (
      artifact.status !== ExportStatus.READY ||
      !artifact.storageKey ||
      !artifact.contentHash ||
      artifact.sizeBytes === null
    ) {
      throw new ConflictException(
        'El archivo debe terminar de generarse antes de revisarlo.',
      );
    }
    if (artifact.contentHash !== input.expectedContentHash) {
      throw new ConflictException(
        'La huella del archivo cambió. Descárgalo nuevamente antes de verificar.',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.read(artifact.storageKey);
    } catch {
      await this.invalidate(
        artifact.id,
        artifact.note,
        'El archivo no existe en el almacenamiento durante la revisión.',
      );
      throw new ConflictException('El archivo ya no está disponible.');
    }
    if (
      this.storage.hash(buffer) !== artifact.contentHash ||
      buffer.byteLength !== artifact.sizeBytes
    ) {
      await this.invalidate(
        artifact.id,
        artifact.note,
        'La integridad del archivo cambió durante la revisión.',
      );
      throw new ConflictException(
        'La integridad del archivo cambió. Debe regenerarse.',
      );
    }

    const verifiedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exportArtifact.update({
        where: { id },
        data: {
          verifiedById: principal.userId,
          verifiedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: artifact.note.clientId,
          userId: principal.userId,
          actorType: AuditActorType.USER,
          action: 'note.export.visual_verification.confirmed',
          entityType: 'export_artifact',
          entityId: artifact.id,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          before: { verifiedAt: artifact.verifiedAt?.toISOString() ?? null },
          after: {
            verifiedAt: verifiedAt.toISOString(),
            contentHash: artifact.contentHash,
          },
          metadata: {
            noteId: artifact.noteId,
            version: artifact.version,
            format: artifact.format,
            checklist: {
              visual: input.visualCheckConfirmed,
              contentParity: input.contentParityConfirmed,
              linksAndMetadata: input.linksAndMetadataConfirmed,
            },
            notes: input.notes?.trim() || null,
          },
        },
      });
      return updated;
    });
  }

  private async auditQueued(
    tx: Prisma.TransactionClient,
    artifactId: string,
    note: { id: string; tenantId: string; clientId: string },
    principal: AuthPrincipal,
    input: CreateExportDto,
    outboxJobId?: string,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: note.tenantId,
        clientId: note.clientId,
        userId: principal.userId,
        actorType: AuditActorType.USER,
        action: 'note.export.queued',
        entityType: 'export_artifact',
        entityId: artifactId,
        requestId: principal.requestId,
        ipAddress: principal.ipAddress,
        userAgent: principal.userAgent,
        metadata: {
          noteId: note.id,
          version: input.expectedVersion,
          format: input.format,
          outboxJobId: outboxJobId ?? null,
        },
      },
    });
  }

  private async invalidate(
    artifactId: string,
    note: { id: string; tenantId: string; clientId: string },
    reason: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.exportArtifact.update({
        where: { id: artifactId },
        data: { status: ExportStatus.INVALID, errorMessage: reason },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: note.tenantId,
          clientId: note.clientId,
          actorType: AuditActorType.SYSTEM,
          action: 'note.export.invalidated',
          entityType: 'export_artifact',
          entityId: artifactId,
          metadata: { noteId: note.id, reason },
        },
      }),
    ]);
  }

  private assertClientPermission(principal: AuthPrincipal, clientId: string) {
    if (!hasPermission(principal, 'notes.export', clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }

  private assertFormatPermission(
    principal: AuthPrincipal,
    format: ExportFormat,
  ) {
    if (
      format === ExportFormat.HTML &&
      !principal.tenantPermissions.includes('notes.export_html')
    ) {
      throw new ForbiddenException(
        'La generación y descarga de HTML está reservada al administrador.',
      );
    }
  }
}
