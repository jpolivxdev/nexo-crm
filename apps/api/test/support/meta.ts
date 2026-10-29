import { createHmac } from 'node:crypto';

export const APP_SECRET = 'segredo-de-teste-do-app-0001';
export const VERIFY_TOKEN = 'token-de-verificacao-teste-01';

export const sign = (raw: string, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

let seq = 0;

/** Corpo de webhook igual ao da Meta, com telefones fictícios (DDD 00). */
export function metaWebhook(
  phoneNumberId: string,
  messages: Record<string, unknown>[] = [],
  statuses: Record<string, unknown>[] = [],
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-TESTE',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '550000000000', phone_number_id: phoneNumberId },
              contacts: [{ wa_id: '5500900000001', profile: { name: 'Cliente Teste' } }],
              ...(messages.length ? { messages } : {}),
              ...(statuses.length ? { statuses } : {}),
            },
          },
        ],
      },
    ],
  };
}

export function textMessage(body: string, from = '5500900000001', id?: string) {
  seq += 1;
  return {
    from,
    id: id ?? `wamid.TESTE${Date.now()}${seq}`,
    timestamp: '1924992000',
    type: 'text',
    text: { body },
  };
}

export function buttonReply(replyId: string, title: string, from = '5500900000001') {
  seq += 1;
  return {
    from,
    id: `wamid.BTN${Date.now()}${seq}`,
    timestamp: '1924992000',
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: replyId, title } },
  };
}
