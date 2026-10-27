import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OutgoingMessage, reminderMessage, reminderStillUseful } from '@nexo/core';
import { ChannelRegistry } from '../channel/channel.registry.js';
import type { ChannelName } from '../channel/channel.types.js';
import { readMessageOverrides } from '../conversation/tenant-bot-config.js';
import { recordEvent } from '../crm/domain-events.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;
const ACTOR = { type: 'system' as const };

type Outcome = 'sent' | 'skipped' | 'needs_template';

interface Prepared {
  messageId: string;
  conversationId: string;
  channel: ChannelName;
  to: string;
  businessExternalId: string;
  payload: OutgoingMessage;
}

/**
 * Envia os lembretes que venceram (24 h e 1 h antes do horário), negócio por negócio.
 * Cada lembrete é "reservado" antes do envio: com dois processos rodando, só um manda.
 * Na dúvida, não manda (lembrete repetido incomoda mais que lembrete a menos).
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant' | 'client'>,
    @Inject(ChannelRegistry) private readonly channels: Pick<ChannelRegistry, 'forMessage'>,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, 'publish'>,
  ) {}

  /**
   * Roda uma vez. Devolve quantos lembretes saíram, para log e testes.
   * `tenantIds` limita a rodada (testes e simulador); sem ele, passa por todos os negócios.
   */
  async runDue(
    now = new Date(),
    options: { tenantIds?: string[] } = {},
  ): Promise<Record<Outcome, number>> {
    const totals: Record<Outcome, number> = { sent: 0, skipped: 0, needs_template: 0 };
    // A lista de negócios não passa pelo RLS (só nome e datas); o resto é negócio por negócio.
    const tenants = await this.db.client.tenantDirectory.findMany({
      where: options.tenantIds ? { id: { in: options.tenantIds } } : undefined,
      select: { id: true },
    });
    for (const { id: tenantId } of tenants) {
      const due = await this.db.withTenant(tenantId, (tx) =>
        tx.reminder.findMany({
          where: { status: 'PENDING', sendAt: { lte: now } },
          select: { id: true },
          orderBy: { sendAt: 'asc' },
          take: BATCH,
        }),
      );
      for (const { id } of due) {
        try {
          totals[await this.sendOne(tenantId, id, now)]++;
        } catch (error) {
          this.logger.error(`Falha ao enviar lembrete: ${(error as Error).name}`);
        }
      }
    }
    return totals;
  }

  private async sendOne(tenantId: string, reminderId: string, now: Date): Promise<Outcome> {
    const prepared = await this.db.withTenant(tenantId, (tx) =>
      this.prepare(tx, tenantId, reminderId, now),
    );
    if (typeof prepared === 'string') return prepared;

    let status = 'failed';
    let externalId: string | null = null;
    try {
      const channel = this.channels.forMessage({
        channel: prepared.channel,
        businessExternalId: prepared.businessExternalId,
      });
      ({ externalId } = await channel.send(prepared.to, prepared.payload));
      status = externalId ? 'sent' : 'not_sent';
    } catch {
      status = 'failed';
    }
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.message.update({
        where: { id: prepared.messageId },
        data: { status, externalId },
      });
      if (status === 'failed') {
        await tx.reminder.update({ where: { id: reminderId }, data: { status: 'FAILED' } });
      }
    });
    this.bus.publish(tenantId, { type: 'conversation.updated', id: prepared.conversationId });
    return 'sent';
  }

  /** Reserva o lembrete, confere se ainda vale e grava a mensagem como pendente. */
  private async prepare(
    tx: TenantTx,
    tenantId: string,
    reminderId: string,
    now: Date,
  ): Promise<Prepared | Outcome> {
    const claimed = await tx.reminder.updateMany({
      where: { id: reminderId, status: 'PENDING' },
      data: { status: 'SENT', sentAt: now },
    });
    if (claimed.count === 0) return 'skipped'; // outro processo já pegou

    const reminder = await tx.reminder.findUniqueOrThrow({
      where: { id: reminderId },
      include: {
        appointment: {
          include: {
            service: { select: { name: true } },
            contact: { select: { id: true, phone: true, optedOutAt: true } },
          },
        },
      },
    });
    const appt = reminder.appointment;
    const cancel = async (reason: string) => {
      await tx.reminder.update({ where: { id: reminderId }, data: { status: 'CANCELLED' } });
      await this.event(tx, tenantId, 'reminder.skipped', reminder, appt.contactId, { reason });
    };

    if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
      await cancel('appointment_inactive');
      return 'skipped';
    }
    if (!reminderStillUseful(reminder.sendAt, appt.startsAt, now)) {
      await cancel('too_late');
      return 'skipped';
    }
    // "Parar" vale também para lembrete.
    if (appt.contact.optedOutAt) {
      await cancel('opted_out');
      return 'skipped';
    }

    const conversation = await tx.conversation.findFirst({
      where: { contactId: appt.contactId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          where: { direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    const channel = (conversation?.channel ?? 'whatsapp') as ChannelName;
    const lastInbound = conversation?.messages[0]?.createdAt;
    // Fora da janela de 24 h o WhatsApp só aceita mensagem de modelo aprovada (entrega E0).
    if (
      channel === 'whatsapp' &&
      (!lastInbound || now.getTime() - lastInbound.getTime() > WHATSAPP_WINDOW_MS)
    ) {
      await tx.reminder.update({ where: { id: reminderId }, data: { status: 'FAILED' } });
      await this.event(tx, tenantId, 'reminder.failed', reminder, appt.contactId, {
        reason: 'template_required',
      });
      return 'needs_template';
    }

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const payload = reminderMessage(
      reminder.kind,
      { id: appt.id, serviceName: appt.service.name, startsAt: appt.startsAt },
      {
        businessName: tenant.name,
        ownerName: tenant.attendantName,
        timeZone: tenant.timezone,
        messages: readMessageOverrides(tenant.botMessages),
      },
    );
    const conv =
      conversation ??
      (await tx.conversation.create({
        data: { tenantId, contactId: appt.contactId, channel, lastMessageAt: now },
      }));
    const message = await tx.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        type: payload.type,
        body: payload.body,
        payload: payload as unknown as Prisma.InputJsonObject,
        status: 'pending',
        createdAt: now,
      },
    });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now } });
    await this.event(tx, tenantId, 'reminder.sent', reminder, appt.contactId, {});

    const route =
      channel === 'whatsapp'
        ? await this.db.client.channelRoute.findFirst({
            where: { tenantId, channel: 'whatsapp' },
            select: { externalId: true },
          })
        : null;
    return {
      messageId: message.id,
      conversationId: conv.id,
      channel,
      to: appt.contact.phone,
      businessExternalId: route?.externalId ?? 'terminal',
      payload,
    };
  }

  private event(
    tx: TenantTx,
    tenantId: string,
    type: string,
    reminder: { id: string; kind: string; appointmentId: string },
    contactId: string,
    extra: Record<string, string>,
  ) {
    return recordEvent(tx, tenantId, {
      type,
      entityType: 'appointment',
      entityId: reminder.appointmentId,
      actor: ACTOR,
      contactId,
      payload: { reminderId: reminder.id, kind: reminder.kind, ...extra },
    });
  }
}
