import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  reason?: string;
  ip?: string | null;
  metadata?: Prisma.InputJsonObject;
}

/**
 * Log de auditoria (só inclusão). Usa createMany porque o INSERT ... RETURNING exigiria
 * poder ler a linha, e registros sem negócio não são legíveis pela aplicação.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const data = {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      metadata: entry.metadata ?? {},
    };
    if (entry.tenantId) {
      await this.db.withTenant(entry.tenantId, (tx) => tx.auditLog.createMany({ data: [data] }));
    } else {
      await this.db.client.auditLog.createMany({ data: [data] });
    }
  }
}
