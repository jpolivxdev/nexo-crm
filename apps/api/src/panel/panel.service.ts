import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  dayRangeUtc,
  defaultStageFor,
  RULE_EVENTS,
  type StageRule,
  todayIn,
  type LocalDate,
} from '@nexo/core';
import { ChannelRegistry } from '../channel/channel.registry.js';
import type { ChannelName } from '../channel/channel.types.js';
import { recordEvent } from '../crm/domain-events.js';
import { readStageRules } from '../crm/stage-rules.js';
import type { ContactSegment } from './panel.schemas.js';
import type { TenantTx } from '../database/prisma.js';
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

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Regras das visões de clientes (Fase 1, fixas; ver DECISOES.md, E17).
 * Frequente: 3+ atendimentos realizados nos últimos 180 dias.
 * Sumida: já foi atendida, mas o último atendimento foi há mais de 45 dias e não tem horário marcado.
 * Faltosa: 2+ faltas nos últimos 180 dias.
 */
export const SEGMENT_RULES = {
  windowDays: 180,
  frequentMinDone: 3,
  missingAfterDays: 45,
  noShowMin: 2,
} as const;

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

  /**
   * Profissional da equipe logada. A equipe só vê e mexe na própria agenda; sem profissional
   * ligada ao login, não entra.
   */
  async staffProfessionalId(tenantId: string, userId: string): Promise<string> {
    const professional = await this.db.withTenant(tenantId, (tx) =>
      tx.professional.findFirst({ where: { userId, active: true }, select: { id: true } }),
    );
    if (!professional) throw new ForbiddenException('Seu acesso não está ligado a uma agenda.');
    return professional.id;
  }

  /** Hoje. Com `professionalId` (equipe), só os horários dela e nada de conversas ou "a fazer". */
  async today(tenantId: string, now = new Date(), professionalId: string | null = null) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const date = todayIn(tenant.timezone, now);
      const day = dayRangeUtc(date, tenant.timezone);
      // Em sequência: as consultas dividem a mesma conexão da transação.
      const appointments = await tx.appointment.findMany({
        where: {
          startsAt: { gte: day.startsAt, lt: day.endsAt },
          status: { not: 'CANCELLED' },
          ...(professionalId ? { professionalId } : {}),
        },
        orderBy: { startsAt: 'asc' },
        select: appointmentSelect,
      });
      if (professionalId) {
        return {
          date,
          businessName: tenant.name,
          timeZone: tenant.timezone,
          appointments,
          handoffs: [],
          tasks: [],
          activity: [],
        };
      }
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
      // "A fazer" com prazo para frente (ex.: oferecer o próximo horário em 10 dias) espera o dia.
      const tasks = await tx.task.findMany({
        where: { doneAt: null, OR: [{ dueAt: null }, { dueAt: { lt: day.endsAt } }] },
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

  async agenda(
    tenantId: string,
    from: LocalDate,
    days: number,
    professionalId: string | null = null,
  ) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const start = dayRangeUtc(from, tenant.timezone).startsAt;
      const end = dayRangeUtc(addDays(from, days - 1), tenant.timezone).endsAt;
      const appointments = await tx.appointment.findMany({
        where: {
          startsAt: { gte: start, lt: end },
          ...(professionalId ? { professionalId } : {}),
        },
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

  async contacts(tenantId: string, q?: string, segment?: ContactSegment, now = new Date()) {
    const digits = q?.replace(/\D/g, '') ?? '';
    return this.db.withTenant(tenantId, async (tx) => {
      const segmentIds = segment ? await this.segmentStats(tx, segment, now) : null;
      const list = await tx.contact.findMany({
        where: q
          ? {
              ...(segmentIds ? { id: { in: [...segmentIds.keys()] } } : {}),
              erasedAt: null,
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : { erasedAt: null, ...(segmentIds ? { id: { in: [...segmentIds.keys()] } } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: segmentIds ? 200 : 50,
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
      });
      if (!segmentIds) return list;
      // Na visão, quem mais se encaixa vem primeiro (mais atendimentos, mais tempo sumida, mais faltas).
      return list
        .map((c) => ({ ...c, stats: segmentIds.get(c.id)! }))
        .sort((a, b) => b.stats.score - a.stats.score);
    });
  }

  /** Clientes de uma visão, com os números que explicam por que estão nela. */
  private async segmentStats(tx: TenantTx, segment: ContactSegment, now: Date) {
    const since = new Date(now.getTime() - SEGMENT_RULES.windowDays * DAY_MS);
    const out = new Map<
      string,
      { score: number; doneCount?: number; noShowCount?: number; lastDoneAt?: Date }
    >();
    if (segment === 'frequent' || segment === 'no_show') {
      const status = segment === 'frequent' ? 'DONE' : 'NO_SHOW';
      const min = segment === 'frequent' ? SEGMENT_RULES.frequentMinDone : SEGMENT_RULES.noShowMin;
      const groups = await tx.appointment.groupBy({
        by: ['contactId'],
        where: { status, startsAt: { gte: since, lte: now } },
        _count: { _all: true },
      });
      for (const g of groups) {
        if (g._count._all < min) continue;
        out.set(g.contactId, {
          score: g._count._all,
          ...(segment === 'frequent'
            ? { doneCount: g._count._all }
            : { noShowCount: g._count._all }),
        });
      }
      return out;
    }
    const cutoff = new Date(now.getTime() - SEGMENT_RULES.missingAfterDays * DAY_MS);
    const last = await tx.appointment.groupBy({
      by: ['contactId'],
      where: { status: 'DONE', startsAt: { lte: now } },
      _max: { startsAt: true },
    });
    const upcoming = await tx.appointment.findMany({
      where: { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gt: now } },
      select: { contactId: true },
      distinct: ['contactId'],
    });
    const booked = new Set(upcoming.map((u) => u.contactId));
    for (const g of last) {
      const lastDoneAt = g._max.startsAt;
      if (!lastDoneAt || lastDoneAt >= cutoff || booked.has(g.contactId)) continue;
      out.set(g.contactId, { score: now.getTime() - lastDoneAt.getTime(), lastDoneAt });
    }
    return out;
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

  /** Regras automáticas de etapa: o que vale hoje para cada acontecimento. */
  stageRules(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { isDefault: true },
        select: {
          rules: true,
          stages: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, key: true, position: true },
          },
        },
      });
      if (!pipeline) throw new NotFoundException('Nenhuma etapa configurada.');
      const rules = readStageRules(pipeline.rules);
      return {
        stages: pipeline.stages.map(({ id, name }) => ({ id, name })),
        rules: RULE_EVENTS.map((event) => {
          const rule = rules.find((r) => r.event === event);
          return {
            event,
            defaultStageId: defaultStageFor(event, pipeline.stages),
            // undefined = segue o padrão; null = não mexe na etapa.
            stageId: rule ? rule.stageId : undefined,
          };
        }),
      };
    });
  }

  /** Salva as regras da dona. Acontecimento que não vier volta à regra padrão. */
  async saveStageRules(tenantId: string, rules: StageRule[]) {
    await this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: { isDefault: true },
        select: { id: true, stages: { select: { id: true } } },
      });
      if (!pipeline) throw new NotFoundException('Nenhuma etapa configurada.');
      const ids = new Set(pipeline.stages.map((s) => s.id));
      if (rules.some((r) => r.stageId !== null && !ids.has(r.stageId))) {
        throw new BadRequestException('Essa etapa não existe mais. Recarregue a página.');
      }
      await tx.pipeline.update({
        where: { id: pipeline.id },
        data: { rules: rules.map((r) => ({ event: r.event, stageId: r.stageId })) },
      });
    });
    return this.stageRules(tenantId);
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

  /** A equipe só muda horário da própria agenda. */
  async assertOwnAppointment(tenantId: string, appointmentId: string, professionalId: string) {
    const found = await this.db.withTenant(tenantId, (tx) =>
      tx.appointment.findFirst({
        where: { id: appointmentId, professionalId },
        select: { id: true },
      }),
    );
    if (!found) throw new NotFoundException('Horário não encontrado.');
  }
}
