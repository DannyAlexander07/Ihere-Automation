import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../common/auth/auth-principal';
import {
  clientIdsForPermission,
  hasPermission,
} from '../common/auth/auth-principal';
import { PrismaService } from '../database/prisma.service';
import { AuditActorType, Prisma } from '../generated/prisma/client';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

const AUTOMATION_NOTES_MODULE = 'automation.notes';

const clientSelect = {
  id: true,
  slug: true,
  name: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  workspaces: {
    where: { moduleCode: AUTOMATION_NOTES_MODULE },
    select: { id: true, moduleCode: true, active: true },
  },
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: AuthPrincipal) {
    const canManage = principal.tenantPermissions.includes('clients.manage');
    const tenantWide = principal.tenantPermissions.includes('clients.read');
    return this.prisma.client.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(canManage ? {} : { active: true }),
        workspaces: {
          some: {
            moduleCode: AUTOMATION_NOTES_MODULE,
            ...(canManage ? {} : { active: true }),
          },
        },
        ...(tenantWide
          ? {}
          : { id: { in: clientIdsForPermission(principal, 'clients.read') } }),
      },
      select: clientSelect,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string, principal: AuthPrincipal) {
    if (
      !principal.tenantPermissions.includes('clients.manage') &&
      !hasPermission(principal, 'clients.read', id)
    ) {
      throw new ForbiddenException('No tienes acceso a este cliente.');
    }
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: principal.tenantId },
      select: clientSelect,
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return client;
  }

  async create(input: CreateClientDto, principal: AuthPrincipal) {
    const name = this.name(input.name);
    const slug = input.slug?.trim() || this.slug(name);
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            tenantId: principal.tenantId,
            name,
            slug,
            workspaces: {
              create: { moduleCode: AUTOMATION_NOTES_MODULE },
            },
          },
          select: clientSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: created.id,
            userId: principal.userId,
            actorType: AuditActorType.USER,
            action: 'automation.client.created',
            entityType: 'Client',
            entityId: created.id,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            after: {
              name: created.name,
              slug: created.slug,
              module: AUTOMATION_NOTES_MODULE,
            },
          },
        });
        return created;
      });
      return client;
    } catch (error) {
      if (this.prismaCode(error) === 'P2002') {
        throw new ConflictException(
          'Ya existe un cliente con ese identificador.',
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateClientDto, principal: AuthPrincipal) {
    if (!Object.keys(input).length) {
      throw new BadRequestException('No se enviaron cambios para guardar.');
    }
    const current = await this.prisma.client.findFirst({
      where: {
        id,
        tenantId: principal.tenantId,
        workspaces: { some: { moduleCode: AUTOMATION_NOTES_MODULE } },
      },
      select: clientSelect,
    });
    if (!current) throw new NotFoundException('Cliente no encontrado.');
    const nextName =
      input.name === undefined ? current.name : this.name(input.name);
    const nextSlug =
      input.slug === undefined ? current.slug : input.slug.trim();
    const nextActive = input.active ?? current.active;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.client.update({
          where: { id },
          data: {
            name: nextName,
            slug: nextSlug,
            active: nextActive,
            workspaces: {
              update: {
                where: {
                  clientId_moduleCode: {
                    clientId: id,
                    moduleCode: AUTOMATION_NOTES_MODULE,
                  },
                },
                data: { active: nextActive },
              },
            },
          },
          select: clientSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: id,
            userId: principal.userId,
            actorType: AuditActorType.USER,
            action: 'automation.client.updated',
            entityType: 'Client',
            entityId: id,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            before: {
              name: current.name,
              slug: current.slug,
              active: current.active,
            },
            after: {
              name: updated.name,
              slug: updated.slug,
              active: updated.active,
            },
          },
        });
        return updated;
      });
    } catch (error) {
      if (this.prismaCode(error) === 'P2002') {
        throw new ConflictException(
          'Ya existe un cliente con ese identificador.',
        );
      }
      throw error;
    }
  }

  async remove(id: string, principal: AuthPrincipal) {
    const current = await this.prisma.client.findFirst({
      where: {
        id,
        tenantId: principal.tenantId,
        workspaces: { some: { moduleCode: AUTOMATION_NOTES_MODULE } },
      },
      select: clientSelect,
    });
    if (!current) throw new NotFoundException('Cliente no encontrado.');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            clientId: id,
            userId: principal.userId,
            actorType: AuditActorType.USER,
            action: 'automation.client.deleted',
            entityType: 'Client',
            entityId: id,
            requestId: principal.requestId,
            ipAddress: principal.ipAddress,
            userAgent: principal.userAgent,
            before: {
              name: current.name,
              slug: current.slug,
              active: current.active,
              module: AUTOMATION_NOTES_MODULE,
            },
          },
        });
        await tx.client.delete({ where: { id } });
      });
      return { success: true };
    } catch (error) {
      if (this.prismaCode(error) === 'P2003') {
        throw new ConflictException(
          'Este cliente ya tiene historial asociado. Desactívalo para ocultarlo sin perder títulos, notas, aprobaciones o métricas.',
        );
      }
      throw error;
    }
  }

  private name(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length < 2) {
      throw new BadRequestException(
        'El nombre debe tener al menos 2 caracteres.',
      );
    }
    return normalized;
  }

  private slug(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/-$/g, '');
    if (normalized.length < 2) {
      throw new BadRequestException(
        'El nombre no permite crear un identificador válido.',
      );
    }
    return normalized;
  }

  private prismaCode(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : undefined;
  }
}
