import { z } from 'zod';
import type { InboundMessage, StatusUpdate } from '../channel.types.js';

/**
 * Formato do webhook da WhatsApp Cloud API, só com o que usamos.
 * Campos desconhecidos são ignorados; tamanhos têm limite para não guardar lixo grande.
 */
const id = z.string().min(1).max(256);
const phone = z.string().regex(/^\d{8,15}$/);

const message = z.object({
  id,
  from: phone,
  timestamp: z.string().max(20),
  type: z.string().max(32),
  text: z.object({ body: z.string().max(4096) }).optional(),
  interactive: z
    .object({
      type: z.string().max(32),
      button_reply: z.object({ id: z.string().max(256), title: z.string().max(64) }).optional(),
      list_reply: z.object({ id: z.string().max(256), title: z.string().max(64) }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().max(256), text: z.string().max(64) }).optional(),
});

const value = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({ phone_number_id: id }),
  contacts: z
    .array(z.object({ wa_id: phone, profile: z.object({ name: z.string().max(256) }).optional() }))
    .max(20)
    .optional(),
  messages: z.array(message).max(20).optional(),
  statuses: z
    .array(z.object({ id, status: z.string().max(32), recipient_id: phone.optional() }))
    .max(50)
    .optional(),
});

export const webhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        id: z.string().max(64),
        changes: z.array(z.object({ field: z.string().max(64), value: z.unknown() })).max(20),
      }),
    )
    .max(20),
});

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
}

/** Traduz o corpo do webhook. Mudanças que não são de mensagem (ou malformadas) são puladas. */
export function parseWebhook(body: unknown): ParsedWebhook | null {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return null;

  const result: ParsedWebhook = { messages: [], statuses: [] };
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const v = value.safeParse(change.value);
      if (!v.success) continue;
      const businessExternalId = v.data.metadata.phone_number_id;
      const names = new Map(v.data.contacts?.map((c) => [c.wa_id, c.profile?.name]) ?? []);

      for (const m of v.data.messages ?? []) {
        result.messages.push({
          channel: 'whatsapp',
          businessExternalId,
          externalId: m.id,
          from: m.from,
          ...(names.get(m.from) ? { profileName: names.get(m.from)! } : {}),
          type: m.type,
          ...toInput(m),
          receivedAt: toDate(m.timestamp),
        });
      }
      for (const s of v.data.statuses ?? []) {
        result.statuses.push({
          channel: 'whatsapp',
          businessExternalId,
          externalId: s.id,
          status: s.status,
        });
      }
    }
  }
  return result;
}

function toInput(m: z.infer<typeof message>): Pick<InboundMessage, 'input' | 'body'> {
  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (reply) return { input: { kind: 'choice', id: reply.id }, body: reply.title };
  if (m.button) return { input: { kind: 'choice', id: m.button.payload }, body: m.button.text };
  if (m.text) return { input: { kind: 'text', text: m.text.body }, body: m.text.body };
  // Foto, áudio, figurinha etc.: o robô responde que não entendeu; o histórico guarda só o tipo.
  return { input: { kind: 'text', text: '' }, body: null };
}

function toDate(timestamp: string): string {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}
