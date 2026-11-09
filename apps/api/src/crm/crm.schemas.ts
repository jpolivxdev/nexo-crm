import { CUSTOM_FIELD_TYPES } from '@nexo/core';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const cents = z.number().int().min(0).max(1_000_000_000);
const name = (max: number) => z.string().trim().min(1, 'Escreva um nome.').max(max);

export const stageInput = z.object({
  id: z.uuid().optional(),
  name: name(40),
  kind: z.enum(['OPEN', 'WON', 'LOST']),
  probability: z.number().int().min(0).max(100).nullable().optional(),
});

export const pipelineBody = z.object({
  name: name(60),
  /** Sem etapas, o funil nasce com o modelo padrão. */
  stages: z
    .array(stageInput)
    .min(2, 'Um funil precisa de pelo menos duas etapas.')
    .max(12)
    .optional(),
});

export const pipelineUpdateBody = z.object({
  name: name(60),
  stages: z.array(stageInput).min(2, 'Um funil precisa de pelo menos duas etapas.').max(12),
});

const fieldValues = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const dealBody = z.object({
  title: z.string().trim().max(80).nullable().optional(),
  valueCents: cents.nullable().optional(),
  ownerUserId: z.uuid().nullable().optional(),
  campaignId: z.uuid().nullable().optional(),
  expectedCloseOn: day.nullable().optional(),
  fields: fieldValues.optional(),
});

export const newDealBody = dealBody.extend({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,15}$/, 'Telefone com DDD, só números.')),
  pipelineId: z.uuid(),
  stageId: z.uuid().optional(),
});

export const campaignBody = z
  .object({
    name: name(60),
    channel: z.string().trim().max(40).nullable().optional(),
    pipelineId: z.uuid().nullable().optional(),
    /** Assistente: cria um funil novo, com o modelo padrão, só para a campanha. */
    newPipelineName: z.string().trim().min(1).max(60).optional(),
    startsOn: day.nullable().optional(),
    endsOn: day.nullable().optional(),
    budgetCents: cents.nullable().optional(),
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, {
    message: 'O fim da campanha vem depois do começo.',
  });

export const archiveCampaignBody = z.object({ archived: z.boolean() });

export const customFieldBody = z
  .object({
    label: name(40),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) >= 2, {
    message: 'Uma lista de opções precisa de pelo menos duas opções.',
  });

export const TASK_KINDS = ['todo', 'call', 'follow_up', 'meeting'] as const;

export const taskBody = z.object({
  title: z.string().trim().min(1, 'Escreva o que fazer.').max(120),
  kind: z.enum(TASK_KINDS).default('todo'),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  dealId: z.uuid().nullable().optional(),
  assigneeUserId: z.uuid().nullable().optional(),
});

export const tasksQuery = z.object({
  /** mine: só as minhas; all: da equipe toda. */
  scope: z.enum(['mine', 'all']).default('mine'),
  done: z.enum(['true', 'false']).default('false'),
});

export const exportQuery = z.object({ pipelineId: z.uuid().optional() });
