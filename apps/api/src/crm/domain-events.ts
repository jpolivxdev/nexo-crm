import { classify } from '@nexo/core';
import type { Prisma } from '../generated/prisma/client.js';
import type { TenantTx } from '../database/prisma.js';
import { readStageRules } from './stage-rules.js';

export interface Actor {
  type: 'contact' | 'user' | 'system';
  id?: string;
}

export interface DomainEvent {
  type: string;
  entityType: string;
  entityId: string;
  actor: Actor;
  /** Cliente a quem o acontecimento se refere. Liga o evento ao histórico e às etapas. */
  contactId?: string;
  payload?: Prisma.InputJsonObject;
}

/**
 * Grava um acontecimento no log de eventos e, quando ele é de um cliente,
 * aplica a classificação automática de etapas (regras de @nexo/core).
 * Roda dentro da transação de quem chamou, presa ao negócio.
 */
export async function recordEvent(
  tx: TenantTx,
  tenantId: string,
  event: DomainEvent,
): Promise<void> {
  await tx.event.create({
    data: {
      tenantId,
      type: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
      actorType: event.actor.type,
      actorId: event.actor.id ?? null,
      payload: {
        ...(event.payload ?? {}),
        ...(event.contactId ? { contactId: event.contactId } : {}),
      },
    },
  });

  if (event.contactId) {
    await applyClassification(tx, tenantId, event.contactId, event.type);
  }
}

/** Garante que o cliente tem um atendimento em andamento no funil padrão do negócio. */
export async function ensureDeal(tx: TenantTx, tenantId: string, contactId: string) {
  const existing = await tx.deal.findFirst({
    where: { contactId, closedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  const pipeline = await tx.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
  });
  const first = pipeline?.stages[0];
  if (!pipeline || !first) return null;

  return tx.deal.create({
    data: { tenantId, contactId, pipelineId: pipeline.id, stageId: first.id },
  });
}

async function applyClassification(
  tx: TenantTx,
  tenantId: string,
  contactId: string,
  eventType: string,
): Promise<void> {
  const deal = await ensureDeal(tx, tenantId, contactId);
  if (!deal) return;

  const stages = await tx.stage.findMany({
    where: { pipelineId: deal.pipelineId },
    select: { id: true, key: true, position: true },
  });
  const doneCount =
    eventType === 'appointment.done'
      ? await tx.appointment.count({ where: { contactId, status: 'DONE' } })
      : 0;
  const pipeline = await tx.pipeline.findUnique({
    where: { id: deal.pipelineId },
    select: { rules: true },
  });

  const target = classify({
    event: eventType,
    stages,
    currentStageId: deal.stageId,
    doneCount,
    rules: readStageRules(pipeline?.rules),
  });
  if (!target || target === deal.stageId) return;

  await tx.deal.update({ where: { id: deal.id }, data: { stageId: target } });
  await tx.event.create({
    data: {
      tenantId,
      type: 'deal.stage_changed',
      entityType: 'deal',
      entityId: deal.id,
      actorType: 'system',
      payload: { contactId, from: deal.stageId, to: target, reason: eventType },
    },
  });
}
