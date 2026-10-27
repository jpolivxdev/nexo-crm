import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { StatusUpdate } from './channel.types.js';

/** Ordem das situações. Avisos da Meta podem chegar fora de ordem: nunca volta atrás. */
const ORDER = ['sent', 'delivered', 'read', 'failed'] as const;

/** Guarda a situação de entrega das mensagens enviadas (enviada, entregue, lida, falhou). */
@Injectable()
export class MessageStatusService {
  constructor(@Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant'>) {}

  async update(tenantId: string, status: StatusUpdate): Promise<void> {
    const rank = ORDER.indexOf(status.status as (typeof ORDER)[number]);
    if (rank === -1) return;
    const earlier = ORDER.slice(0, rank) as string[];
    await this.db.withTenant(tenantId, (tx) =>
      tx.message.updateMany({
        where: {
          externalId: status.externalId,
          direction: 'OUTBOUND',
          OR: [{ status: null }, { status: { in: earlier } }],
        },
        data: { status: status.status },
      }),
    );
  }
}
