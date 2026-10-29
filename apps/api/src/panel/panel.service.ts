import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { addDays, dayRangeUtc, todayIn, type LocalDate } from '@nexo/core';
import { ChannelRegistry } from '../channel/channel.registry.js';
import type { ChannelName } from '../channel/channel.types.js';
import { recordEvent } from '../crm/domain-events.js';
import { PrismaService } from '../database/prisma.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Acontecimentos que aparecem em "O que aconteceu" no Hoje. O resto fica só na ficha. */
export const ACTIVITY_TYPES = [
  'contact.created',
  'appointment.created',
  'appointment.rescheduled',
  'appointment.confirmed',
  'appointment.cancelled',
  'appointment.done',
  'appointment.no_show',
  'handoff.requested',
  'contact.opted_out',
] as const;

const ACTIVITY_LIMIT = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cliente do evento, lido do payload (JSON) só se for um ID válido. */
function eventContactId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const id = (payload as Record<string, unknown>).contactId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

const appointmentSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  source: true,
  service: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true, phone: true } },
} as const;

/**
 * Leituras e ações do painel do negócio. Sempre com o negócio da sessão (withTenant + RLS).
 * Mudanças de agenda passam pelo SchedulingService (regras e horário duplo).
 */
@Injectable()
export class PanelService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  async today(tenantId: string, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const date = todayIn(tenant.timezone, now);
      const day = dayRangeUtc(date, tenant.timezone);
      // Em sequência: as consultas dividem a mesma conexão da transação.
      const appointments = await tx.appointment.findMany({
        where: { startsAt: { gte: day.startsAt, lt: day.endsAt }, status: { not: 'CANCELLED' } },
        orderBy: { startsAt: 'asc' },
        select: appointmentSelect,
      });
      const handoffs = await tx.conversation.findMany({
        where: { botPausedAt: { not: null } },
        orderBy: { botPausedAt: 'asc' },
        select: {
          id: true,
          botPausedAt: true,
          contact: { select: { id: true, name: true, phone: true } },
          messages: {
            where: { direction: 'INBOUND' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, createdAt: true },
          },
        },
      });
      const tasks = await tx.task.findMany({
        where: { doneAt: null },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: 20,
        select: {
          id: true,
          title: true,
          dueAt: true,
          contact: { select: { id: true, name: true } },
        },
      });
      const events = await tx.event.findMany({
        where: { type: { in: [...ACTIVITY_TYPES] } },
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: { id: true, type: true, actorType: true, createdAt: true, payload: true },
      });
      const contactIds = [
        ...new Set(events.map((e) => eventContactId(e.payload)).filter((id) => id !== null)),
      ];
      const contacts = await tx.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, name: true, phone: true },
      });
      return {
        date,
        businessName: tenant.name,
        timeZone: tenant.timezone,
        appointments,
        handoffs: handoffs.map((h) => ({
          conversationId: h.id,
          since: h.botPausedAt,
          contact: h.contact,
          lastMessage: h.messages[0] ?? null,
        })),
        tasks,
        // Só o tipo, quem fez e a cliente: o payload inteiro não sai para a tela.
        activity: events.map((e) => {
          const contactId = eventContactId(e.payload);
          return {
            id: e.id,
            type: e.type,
            actorType: e.actorType,
            createdAt: e.createdAt,
            contact: contacts.find((c) => c.id === contactId) ?? null,
          };
        }),
      };
    });
  }

  async agenda(tenantId: string, from: LocalDate, days: number) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const start = dayRangeUtc(from, tenant.timezone).startsAt;
      const end = dayRangeUtc(addDays(from, days - 1), tenant.timezone).endsAt;
      const appointments = await tx.appointment.findMany({
        where: { startsAt: { gte: start, lt: end } },
        orderBy: { startsAt: 'asc' },
        select: appointmentSelect,
      });
      return { from, days, timeZone: tenant.timezone, appointments };
    });
  }

  services(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.service.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      }),
    );
  }

  contacts(tenantId: string, q?: string) {
    const digits = q?.replace(/\D/g, '') ?? '';
    return this.db.withTenant(tenantId, (tx) =>
      tx.contact.findMany({
        where: q
          ? {
              erasedAt: null,
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : { erasedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          phone: true,
          optedOutAt: true,
          deals: {
            where: { closedAt: null },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { stage: { select: { id: true, name: true } } },
          },
        },
      }),
    );
  }

  async createContact(
    tenantId: string,
    input: { name: string; phone: string },
    actor: { type: 'user'; id: string },
  ) {
    const contact = await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
      });
      if (existing) throw new ConflictException('Já existe uma cliente com esse telefone.');
      const created = await tx.contact.create({
        data: { tenantId, name: input.name, phone: input.phone, source: 'PANEL' },
      });
      await recordEvent(tx, tenantId, {
        type: 'contact.created',
        entityType: 'contact',
        entityId: created.id,
        actor,
        contactId: created.id,
        payload: { channel: 'panel' },
      });
      return created;
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: contact.id });
    return contact;
  }

  async contact(tenantId: string, contactId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, erasedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          notes: true,
          tags: true,
          optedOutAt: true,
          source: true,
          createdAt: true,
          deals: {
            where: { closedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              stage: { select: { id: true, name: true } },
              pipeline: {
                select: {
                  stages: { orderBy: { position: 'asc' }, select: { id: true, name: true } },
                },
              },
            },
          },
          appointments: {
            orderBy: { startsAt: 'desc' },
            take: 30,
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              service: { select: { name: true } },
            },
          },
          conversations: {
            select: {
              id: true,
              channel: true,
              botPausedAt: true,
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: {
                  id: true,
                  direction: true,
                  type: true,
                  body: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
          tasks: {
            where: { doneAt: null },
            select: { id: true, title: true, dueAt: true },
          },
        },
      });
      if (!contact) throw new NotFoundException('Cliente não encontrada.');
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const { deals, conversations, ...rest } = contact;
      const deal = deals[0] ?? null;
      return {
        ...rest,
        timeZone: tenant.timezone,
        deal: deal ? { id: deal.id, stage: deal.stage, stages: deal.pipeline.stages } : null,
        conversations: conversations.map((c) => ({ ...c, messages: c.messages.reverse() })),
      };
    });
  }

  async updateContact(
    tenantId: string,
    contactId: string,
    input: { name?: string; notes?: string | null; tags?: string[] },
  ) {
    const updated = await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.contact.findFirst({
        where: { id: contactId, erasedAt: null },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Cliente não encontrada.');
      return tx.contact.update({
        where: { id: contactId },
        data: input,
        select: { id: true, name: true, notes: true, tags: true },
      });
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: contactId });
    return updated;
  }

  pipeline(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { isDefault: true },
        select: {
          id: true,
          name: true,
          stages: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              deals: {
                where: { closedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: 100,
                select: { id: true, contact: { select: { id: true, name: true, phone: true } } },
              },
            },
          },
        },
      });
      if (!pipeline) throw new NotFoundException('Nenhuma etapa configurada.');
      return pipeline;
    });
  }

  /** A dona move o atendimento para qualquer etapa (inclusive para trás ou "Não seguiu"). */
  async moveDeal(
    tenantId: string,
    dealId: string,
    stageId: string,
    actor: { type: 'user'; id: string },
  ) {
    const deal = await this.db.withTenant(tenantId, async (tx) => {
      const deal = await tx.deal.findUnique({ where: { id: dealId } });
      if (!deal) throw new NotFoundException('Atendimento não encontrado.');
      const stage = await tx.stage.findFirst({
        where: { id: stageId, pipelineId: deal.pipelineId },
      });
      if (!stage) throw new NotFoundException('Etapa não encontrada.');
      if (deal.stageId === stageId) return deal;
      const updated = await tx.deal.update({ where: { id: dealId }, data: { stageId } });
      await tx.event.create({
        data: {
          tenantId,
          type: 'deal.stage_changed',
          entityType: 'deal',
          entityId: dealId,
          actorType: actor.type,
          actorId: actor.id,
          payload: { contactId: deal.contactId, from: deal.stageId, to: stageId, reason: 'manual' },
        },
      });
      return updated;
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: deal.contactId });
    return { id: deal.id, stageId: deal.stageId };
  }

  async completeTask(tenantId: string, taskId: string) {
    await this.db.withTenant(tenantId, async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!task) throw new NotFoundException('Lembrete não encontrado.');
      await tx.task.update({ where: { id: taskId }, data: { doneAt: new Date() } });
    });
    return { ok: true };
  }

  /**
   * A dona responde pela ficha. Responder assume a conversa (pausa o robô).
   * No WhatsApp, mensagem livre só até 24 horas depois da última mensagem da cliente.
   */
  async reply(
    tenantId: string,
    conversationId: string,
    text: string,
    actor: { type: 'user'; id: string },
    now = new Date(),
  ) {
    const prepared = await this.db.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: {
          contact: { select: { id: true, phone: true, optedOutAt: true } },
          messages: {
            where: { direction: 'INBOUND' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      });
      if (!conversation) throw new NotFoundException('Conversa não encontrada.');
      if (conversation.contact.optedOutAt) {
        throw new ConflictException('Esta cliente pediu para não receber mensagens.');
      }
      const lastInbound = conversation.messages[0]?.createdAt;
      if (
        conversation.channel === 'whatsapp' &&
        (!lastInbound || now.getTime() - lastInbound.getTime() > WHATSAPP_WINDOW_MS)
      ) {
        throw new ConflictException(
          'Passaram mais de 24 horas desde a última mensagem da cliente. O WhatsApp só deixa enviar mensagem de modelo aprovada.',
        );
      }
      if (!conversation.botPausedAt) {
        await tx.conversation.update({ where: { id: conversationId }, data: { botPausedAt: now } });
      }
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          direction: 'OUTBOUND',
          type: 'text',
          body: text,
          payload: { type: 'text', body: text },
          status: 'pending',
          createdAt: now,
        },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
      await recordEvent(tx, tenantId, {
        type: 'message.sent_by_owner',
        entityType: 'conversation',
        entityId: conversationId,
        actor,
        contactId: conversation.contactId,
      });
      const route =
        conversation.channel === 'whatsapp'
          ? await this.db.client.channelRoute.findFirst({
              where: { tenantId, channel: 'whatsapp' },
              select: { externalId: true },
            })
          : null;
      return {
        message,
        channel: conversation.channel as ChannelName,
        to: conversation.contact.phone,
        businessExternalId: route?.externalId ?? 'terminal',
      };
    });

    let status = 'failed';
    let externalId: string | null = null;
    try {
      const channel = this.channels.forMessage({
        channel: prepared.channel,
        businessExternalId: prepared.businessExternalId,
      });
      ({ externalId } = await channel.send(prepared.to, { type: 'text', body: text }));
      status = externalId ? 'sent' : 'not_sent';
    } catch {
      status = 'failed';
    }
    await this.db.withTenant(tenantId, (tx) =>
      tx.message.update({ where: { id: prepared.message.id }, data: { status, externalId } }),
    );
    this.bus.publish(tenantId, { type: 'conversation.updated', id: conversationId });
    return { id: prepared.message.id, status };
  }
}
