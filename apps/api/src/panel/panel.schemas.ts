import { z } from 'zod';
import { stageRulesSchema } from '../crm/stage-rules.js';

/** Entradas do painel. Tudo validado com limite de tamanho; tenant_id nunca vem daqui. */
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const agendaQuery = z.object({
  from: localDate,
  days: z.coerce.number().int().min(1).max(42).default(1),
});

/** Período do relatório, em dias (inclui hoje). */
export const reportQuery = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
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

export const CONTACT_SEGMENTS = ['frequent', 'missing', 'no_show'] as const;
export type ContactSegment = (typeof CONTACT_SEGMENTS)[number];

export const contactsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  segment: z.enum(CONTACT_SEGMENTS).optional(),
});

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

/** Excluir é para sempre: o painel manda a confirmação explícita. */
export const eraseContactBody = z.object({
  confirm: z.literal(true, { error: 'Confirme que quer excluir os dados da cliente.' }),
});

export const moveDealBody = z.object({ stageId: z.uuid() });

export const replyBody = z.object({ text: z.string().trim().min(1).max(4096) });

export const stageRulesBody = z.object({ rules: stageRulesSchema });
