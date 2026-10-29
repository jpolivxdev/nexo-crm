import type { OutgoingMessage } from '@nexo/core';
import type { MessagingChannel } from '../channel.types.js';
import { toGraphPayload } from './graph-payload.js';

export const GRAPH_API_VERSION = 'v25.0';

export class ChannelSendError extends Error {
  constructor(readonly status: number) {
    // Só o código HTTP: a resposta da Meta pode repetir o telefone e o texto.
    super(`Envio pela WhatsApp Cloud API falhou (HTTP ${status}).`);
  }
}

/** Envio pela API oficial da Meta (WhatsApp Cloud API). Nada de integração não oficial. */
export class WhatsAppCloudChannel implements MessagingChannel {
  readonly name = 'whatsapp' as const;

  constructor(
    private readonly config: {
      phoneNumberId: string;
      accessToken: string;
      fetch?: typeof fetch;
      apiVersion?: string;
    },
  ) {}

  async send(to: string, message: OutgoingMessage): Promise<{ externalId: string | null }> {
    const doFetch = this.config.fetch ?? fetch;
    const version = this.config.apiVersion ?? GRAPH_API_VERSION;
    const response = await doFetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(toGraphPayload(to, message)),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new ChannelSendError(response.status);
    const data = (await response.json()) as { messages?: { id?: string }[] };
    return { externalId: data.messages?.[0]?.id ?? null };
  }
}
