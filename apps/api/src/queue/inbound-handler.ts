import type { InboundMessage } from '../channel/channel.types.js';

/** Quem processa uma mensagem recebida. Na E6 é o serviço de conversas (robô + CRM). */
export interface InboundHandler {
  handleInbound(tenantId: string, message: InboundMessage): Promise<void>;
}

export const INBOUND_HANDLER = Symbol('INBOUND_HANDLER');
