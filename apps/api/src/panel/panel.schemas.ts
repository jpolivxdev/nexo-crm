import { z } from 'zod';

/** Entradas do painel. Tudo validado com limite de tamanho; tenant_id nunca vem daqui. */
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const agendaQuery = z.object({
  from: localDate,
  days: z.coerce.number().int().min(1).max(42).default(1),
});

export const slotsQuery = z.object({ serviceId: z.uuid(), date: localDate });

export const bookBody = z.object({
  contactId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime(),
});

export const statusBody = z.object({
  status: z.enum(['CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELLED']),
});

export const rescheduleBody = z.object({ startsAt: z.iso.datetime() });

export const contactsQuery = z.object({ q: z.string().trim().max(100).optional() });

export const createContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,15}$/, 'Telefone com DDD, só números.')),
});

export const updateContactBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const moveDealBody = z.object({ stageId: z.uuid() });

export const replyBody = z.object({ text: z.string().trim().min(1).max(4096) });
