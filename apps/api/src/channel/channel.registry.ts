import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import type { InboundMessage, MessagingChannel } from './channel.types.js';
import { WhatsAppCloudChannel } from './whatsapp/whatsapp-cloud.channel.js';

/** Escolhe por onde responder uma mensagem: pelo mesmo canal e número em que ela chegou. */
@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly simulators = new Map<string, MessagingChannel>();

  constructor(@Inject(ENV) private readonly env: Pick<Env, 'WHATSAPP_ACCESS_TOKEN'>) {}

  /** O simulador registra para onde entregar as respostas de um número de teste. */
  registerSimulator(businessExternalId: string, channel: MessagingChannel): void {
    this.simulators.set(businessExternalId, channel);
  }

  forMessage(message: Pick<InboundMessage, 'channel' | 'businessExternalId'>): MessagingChannel {
    if (message.channel === 'simulator') {
      return this.simulators.get(message.businessExternalId) ?? this.discard('simulator');
    }
    const accessToken = this.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return this.discard('whatsapp');
    return new WhatsAppCloudChannel({ phoneNumberId: message.businessExternalId, accessToken });
  }

  /** Sem credencial (ou simulador desligado): a resposta fica só no histórico. */
  private discard(name: MessagingChannel['name']): MessagingChannel {
    const logger = this.logger;
    return {
      name,
      send() {
        logger.warn(`Canal ${name} sem envio configurado: resposta guardada só no histórico.`);
        return Promise.resolve({ externalId: null });
      },
    };
  }
}
