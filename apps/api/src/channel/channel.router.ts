import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ChannelName } from './channel.types.js';

/**
 * Descobre de qual negócio é um número do canal (phone_number_id da Meta).
 * channel_routes fica fora do RLS por isso, e a aplicação só pode ler essa tabela.
 */
@Injectable()
export class ChannelRouter {
  constructor(private readonly prisma: PrismaService) {}

  async tenantFor(channel: ChannelName, externalId: string): Promise<string | null> {
    const route = await this.prisma.client.channelRoute.findUnique({
      where: { channel_externalId: { channel, externalId } },
      select: { tenantId: true },
    });
    return route?.tenantId ?? null;
  }
}
