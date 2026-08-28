import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import { hasPermission } from '../common/auth/auth-principal';
import {
  AuditActorType,
  LearningRuleStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';
import type { ListLearningDto } from './dto/list-learning.dto';

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async signals(query: ListLearningDto, principal: AuthPrincipal) {
    const clientIds = this.allowedClientIds(
      principal,
      'learning.read',
      query.clientId,
    );
    return this.prisma.correctionSignal.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(clientIds ? { clientId: { in: clientIds } } : {}),
        promotedRuleId: null,
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      select: {
        id: true,
        clientId: true,
        field: true,
        beforeValue: true,
        afterValue: true,
        reason: true,
        correctionType: true,
        createdAt: true,
        client: { select: { name: true } },
        proposal: { select: { id: true, title: true } },
        note: {
          select: {
            id: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { title: true },
            },
          },
        },
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async rules(query: ListLearningDto, principal: AuthPrincipal) {
    const clientIds = this.allowedClientIds(
      principal,
      'learning.read',
      query.clientId,
    );
    return this.prisma.learningRule.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(clientIds
          ? { OR: [{ clientId: { in: clientIds } }, { clientId: null }] }
          : {}),
        ...(query.clientId
          ? { OR: [{ clientId: query.clientId }, { clientId: null }] }
          : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        client: { select: { name: true } },
        approvedBy: { select: { displayName: true } },
        correctionSignals: {
          select: { id: true, field: true, afterValue: true, reason: true },
          take: 20,
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  async createRule(input: CreateLearningRuleDto, principal: AuthPrincipal) {
    this.assertClientPermission(principal, 'learning.manage', input.clientId);
    const uniqueIds = [...new Set(input.signalIds)];
    if (uniqueIds.length !== input.signalIds.length) {
      throw new ConflictException('La evidencia contiene señales repetidas.');
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const signals = await tx.correctionSignal.findMany({
            where: {
              id: { in: uniqueIds },
              tenantId: principal.tenantId,
              clientId: input.clientId,
              promotedRuleId: null,
            },
            select: { id: true },
          });
          if (signals.length !== uniqueIds.length) {
            throw new ConflictException(
              'Una o más señales no existen, ya fueron promovidas o pertenecen a otro cliente.',
            );
          }
          const rule = await tx.learningRule.create({
            data: {
              tenantId: principal.tenantId,
              clientId: input.clientId,
              code: input.code,
              title: input.title,
              description: input.description,
              glossary: input.glossary
                ? (input.glossary as unknown as Prisma.InputJsonObject)
                : undefined,
              evidenceCount: signals.length,
            },
          });
          const promoted = await tx.correctionSignal.updateMany({
            where: { id: { in: uniqueIds }, promotedRuleId: null },
            data: { promotedRuleId: rule.id },
          });
          if (promoted.count !== uniqueIds.length) {
            throw new ConflictException(
              'Las señales cambiaron durante la promoción.',
            );
          }
          await tx.auditLog.create({
            data: {
              tenantId: principal.tenantId,
              clientId: input.clientId,
              userId: principal.userId,
              requestId: principal.requestId,
              ipAddress: principal.ipAddress,
              userAgent: principal.userAgent,
              actorType: AuditActorType.USER,
              action: 'learning.rule.created',
              entityType: 'learning_rule',
              entityId: rule.id,
              after: {
                status: rule.status,
                code: rule.code,
                evidenceCount: signals.length,
              },
              metadata: { signalIds: uniqueIds },
            },
          });
          return rule;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una regla con ese código para el cliente.',
        );
      }
      throw error;
    }
  }

  async setStatus(
    id: string,
    status: LearningRuleStatus,
    principal: AuthPrincipal,
  ) {
    const rule = await this.prisma.learningRule.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!rule) throw new NotFoundException('Regla no encontrada.');
    if (!rule.clientId)
      throw new ConflictException(
        'Las reglas globales requieren una revisión de alcance separada.',
      );
    this.assertClientPermission(principal, 'learning.approve', rule.clientId);
    if (status === LearningRuleStatus.DRAFT) {
      throw new ConflictException(
        'Una regla activa o retirada no puede volver a borrador.',
      );
    }
    if (rule.status === status) return rule;
    if (rule.status === LearningRuleStatus.RETIRED) {
      throw new ConflictException(
        'Una regla retirada no puede reactivarse; crea una versión nueva.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.learningRule.update({
        where: { id },
        data: {
          status,
          ...(status === LearningRuleStatus.ACTIVE
            ? { approvedById: principal.userId, approvedAt: new Date() }
            : { approvedById: null, approvedAt: null }),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: rule.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action:
            status === LearningRuleStatus.ACTIVE
              ? 'learning.rule.activated'
              : 'learning.rule.retired',
          entityType: 'learning_rule',
          entityId: id,
          before: { status: rule.status },
          after: { status },
        },
      });
      return updated;
    });
  }

  async restore(id: string, principal: AuthPrincipal) {
    if (!principal.tenantPermissions.includes('learning.restore')) {
      throw new ForbiddenException(
        'Solo un administrador puede recuperar reglas retiradas.',
      );
    }
    const rule = await this.prisma.learningRule.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!rule) throw new NotFoundException('Regla no encontrada.');
    if (!rule.clientId) {
      throw new ConflictException(
        'Las reglas globales requieren una revisión de alcance separada.',
      );
    }
    if (rule.status !== LearningRuleStatus.RETIRED) {
      throw new ConflictException('Solo una regla retirada puede recuperarse.');
    }
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.learningRule.updateMany({
        where: {
          id,
          tenantId: principal.tenantId,
          status: LearningRuleStatus.RETIRED,
        },
        data: {
          status: LearningRuleStatus.ACTIVE,
          approvedById: principal.userId,
          approvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'La regla ya fue recuperada o cambió durante la operación.',
        );
      }
      const restored = await tx.learningRule.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          clientId: rule.clientId,
          userId: principal.userId,
          requestId: principal.requestId,
          ipAddress: principal.ipAddress,
          userAgent: principal.userAgent,
          actorType: AuditActorType.USER,
          action: 'learning.rule.restored',
          entityType: 'learning_rule',
          entityId: id,
          before: { status: rule.status },
          after: { status: restored.status },
        },
      });
      return restored;
    });
  }

  private allowedClientIds(
    principal: AuthPrincipal,
    permission: string,
    requested?: string,
  ) {
    if (requested) {
      this.assertClientPermission(principal, permission, requested);
      return [requested];
    }
    if (principal.tenantPermissions.includes(permission)) return undefined;
    return principal.clientIds.filter((clientId) =>
      hasPermission(principal, permission, clientId),
    );
  }

  private assertClientPermission(
    principal: AuthPrincipal,
    permission: string,
    clientId: string,
  ) {
    if (!hasPermission(principal, permission, clientId)) {
      throw new ForbiddenException('No tienes permisos para este cliente.');
    }
  }
}
