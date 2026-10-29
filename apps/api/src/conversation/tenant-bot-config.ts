import type { FaqItem, MessageOverrides } from '@nexo/core';
import { z } from 'zod';

const faqSchema = z
  .array(z.object({ question: z.string().min(1).max(200), answer: z.string().min(1).max(1024) }))
  .max(10);
const messagesSchema = z.record(z.string(), z.string().max(1024));

/** FAQ e mensagens editáveis vêm do banco como JSON: valida antes de usar, e ignora o que vier torto. */
export function readFaq(raw: unknown): FaqItem[] {
  const parsed = faqSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function readMessageOverrides(raw: unknown): MessageOverrides {
  const parsed = messagesSchema.safeParse(raw);
  return parsed.success ? (parsed.data as MessageOverrides) : {};
}
