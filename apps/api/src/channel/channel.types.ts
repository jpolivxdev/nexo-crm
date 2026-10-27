import type { BotInput, OutgoingMessage } from '@nexo/core';

export type ChannelName = 'whatsapp' | 'simulator';

/** Mensagem recebida, já traduzida do formato do canal. Conteúdo sempre não confiável. */
export interface InboundMessage {
  channel: ChannelName;
  /** Número do negócio no canal (na Meta, o phone_number_id). Diz para qual negócio é. */
  businessExternalId: string;
  /** ID da mensagem no canal (wamid). Garante que cada mensagem é processada uma vez. */
  externalId: string;
  /** Telefone de quem mandou, só dígitos com código do país. */
  from: string;
  /** Nome do perfil do WhatsApp, quando vem. */
  profileName?: string;
  /** Tipo original (text, interactive, image...). */
  type: string;
  /** O que o robô entende: texto digitado ou opção tocada. */
  input: BotInput;
  /** Texto para guardar no histórico. */
  body: string | null;
  receivedAt: string;
}

/** Atualização de entrega de uma mensagem enviada (enviada, entregue, lida, falhou). */
export interface StatusUpdate {
  channel: ChannelName;
  businessExternalId: string;
  externalId: string;
  status: string;
}

/** Quem envia mensagens. O robô e o painel não sabem se é a Meta ou o simulador. */
export interface MessagingChannel {
  readonly name: ChannelName;
  send(to: string, message: OutgoingMessage): Promise<{ externalId: string | null }>;
}

/** Texto curto para guardar no histórico de uma mensagem enviada. */
export function outgoingBody(message: OutgoingMessage): string {
  return message.body;
}
