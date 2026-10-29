import { Inject, Injectable, Logger } from '@nestjs/common';
import { RateLimiter } from '../auth/rate-limiter.js';
import { ENV, type Env } from '../config/env.js';
import type { InboundMessage, MessagingChannel } from './channel.types.js';
import { WhatsAppCloudChannel } from './whatsapp/whatsapp-cloud.channel.js';

/**
 * Teto de envios pela Meta por número do negócio, por hora (SEGURANCA.md, A10). A piloto manda
 * poucas dezenas por dia; passar disso indica erro ou abuso, e a Meta pode bloquear o número.
 */
export const SENDS_PER_HOUR = 200;

export class SendLimitError extends Error {
  constructor() {
    super('Limite de envios por hora deste número atingido.');
  }
}

/** Embrulha um canal para recusar o envio quando o número passa do teto. */
export function limitSends(
  channel: MessagingChannel,
  limiter: RateLimiter,
  key: string,
  onLimit: () => void = () => {},
): MessagingChannel {
  return {
    name: channel.name,
    send(to, message) {
      if (!limiter.take(key)) {
        onLimit();
        return Promise.reject(new SendLimitError());
      }
      return channel.send(to, message);
    },
  };
}

/** Escolhe por onde responder uma mensagem: pelo mesmo canal e número em que ela chegou. */
@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly simulators = new Map<string, MessagingChannel>();
  private readonly sendLimiter = new RateLimiter(SENDS_PER_HOUR, 60 * 60 * 1000);

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
    return limitSends(
      new WhatsAppCloudChannel({ phoneNumberId: message.businessExternalId, accessToken }),
      this.sendLimiter,
      message.businessExternalId,
      // Falha de envio fica marcada na mensagem; o log só diz que o teto foi atingido.
      () => this.logger.warn('Teto de envios por hora atingido: mensagem não enviada.'),
    );
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
