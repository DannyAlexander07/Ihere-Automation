import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditEvent {
  tenantId: string;
  clientId?: string;
  userId?: string;
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        ...event,
        actorType: event.actorType ?? AuditActorType.USER,
      },
    });
  }
}
