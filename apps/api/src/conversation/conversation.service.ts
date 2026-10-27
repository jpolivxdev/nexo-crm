import { Inject, Injectable } from '@nestjs/common';
import {
  type BotAction,
  type BotContext,
  type BotState,
  handleBotMessage,
  isOpenAt,
  type OutgoingMessage,
} from '@nexo/core';
import { createBotPorts } from '../bot/bot-ports.js';
import { ChannelRegistry } from '../channel/channel.registry.js';
import type { InboundMessage, MessagingChannel } from '../channel/channel.types.js';
import { recordEvent } from '../crm/domain-events.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { InboundHandler } from '../queue/inbound-handler.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import { OWNER_NOTIFIER, type OwnerNotifier } from './owner-notifier.js';
import { readFaq, readMessageOverrides } from './tenant-bot-config.js';

/** Situação da mensagem recebida: "processed" quando o robô já respondeu. */
const PROCESSED = 'processed';

interface Prepared {
  contactId: string;
  conversationId: string;
  inboundId: string;
  state: BotState | null;
  paused: boolean;
  ctx: BotContext;
}

/**
 * Recebe uma mensagem (WhatsApp ou simulador) e faz o ciclo completo:
 * cliente e conversa no CRM, histórico, robô, etapas automáticas, respostas e aviso ao painel.
 *
 * Cada passo que grava roda em transação presa ao negócio (RLS). A mesma mensagem (wamid)
 * nunca é respondida duas vezes; se o processo cair no meio, a fila tenta de novo e o
 * processamento continua de onde a mensagem ficou.
 */
@Injectable()
export class ConversationService implements InboundHandler {
  constructor(
    @Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant'>,
    @Inject(SchedulingService) private readonly scheduling: SchedulingService,
    @Inject(ChannelRegistry) private readonly channels: Pick<ChannelRegistry, 'forMessage'>,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, 'publish'>,
    @Inject(OWNER_NOTIFIER) private readonly notifier: OwnerNotifier,
  ) {}

  async handleInbound(tenantId: string, message: InboundMessage, now = new Date()): Promise<void> {
    const prepared = await this.prepare(tenantId, message, now);
    if (!prepared) return; // repetida e já respondida

    // Conversa com a equipe: o robô fica quieto até a dona devolver.
    if (prepared.paused) {
      await this.markProcessed(tenantId, prepared.inboundId);
      this.bus.publish(tenantId, { type: 'conversation.updated', id: prepared.conversationId });
      return;
    }

    const ports = createBotPorts({
      db: this.db,
      scheduling: this.scheduling,
      tenantId,
      contactId: prepared.contactId,
      now: () => now,
    });
    const result = await handleBotMessage(prepared.state, message.input, prepared.ctx, ports);

    const outbound = await this.db.withTenant(tenantId, async (tx) => {
      await tx.conversation.update({
        where: { id: prepared.conversationId },
        data: {
          botState: result.state as unknown as Prisma.InputJsonObject,
          lastMessageAt: now,
        },
      });
      await this.applyActions(tx, tenantId, prepared, result.actions, message.channel, now);
      const saved = [];
      for (const [i, reply] of result.replies.entries()) {
        // Um milissegundo de diferença mantém a ordem das respostas no histórico.
        const at = new Date(now.getTime() + i + 1);
        saved.push(await this.saveOutbound(tx, tenantId, prepared.conversationId, reply, at));
      }
      await tx.message.update({ where: { id: prepared.inboundId }, data: { status: PROCESSED } });
      return saved;
    });

    await this.deliver(tenantId, this.channels.forMessage(message), message.from, outbound);

    if (result.actions.some((a) => a.type === 'handoff')) {
      this.bus.publish(tenantId, { type: 'handoff.requested', id: prepared.conversationId });
      await this.notifier.handoffRequested(tenantId, {
        contactId: prepared.contactId,
        conversationId: prepared.conversationId,
      });
    }
    this.bus.publish(tenantId, { type: 'conversation.updated', id: prepared.conversationId });
  }

  /** A dona devolve a conversa para o robô. */
  async resumeBot(
    tenantId: string,
    conversationId: string,
    actor: { type: 'user'; id?: string },
  ): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      if (!conversation.botPausedAt) return;
      await tx.conversation.update({
        where: { id: conversationId },
        data: { botPausedAt: null, botState: { step: 'menu' } },
      });
      await recordEvent(tx, tenantId, {
        type: 'conversation.bot_resumed',
        entityType: 'conversation',
        entityId: conversationId,
        actor,
        contactId: conversation.contactId,
      });
    });
    this.bus.publish(tenantId, { type: 'conversation.updated', id: conversationId });
  }

  // ---------- internos ----------

  /** Grava cliente, conversa e mensagem recebida. Devolve null se a mensagem já foi respondida. */
  private prepare(tenantId: string, message: InboundMessage, now: Date): Promise<Prepared | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      let contact = await tx.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone: message.from } },
      });
      if (!contact) {
        contact = await tx.contact.create({
          data: {
            tenantId,
            phone: message.from,
            name: message.profileName ?? null,
            source: 'WHATSAPP',
          },
        });
        await recordEvent(tx, tenantId, {
          type: 'contact.created',
          entityType: 'contact',
          entityId: contact.id,
          actor: { type: 'contact', id: contact.id },
          contactId: contact.id,
          payload: { channel: message.channel },
        });
      } else if (!contact.name && message.profileName) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: { name: message.profileName },
        });
      }

      const conversation = await tx.conversation.upsert({
        where: {
          tenantId_contactId_channel: { tenantId, contactId: contact.id, channel: message.channel },
        },
        create: { tenantId, contactId: contact.id, channel: message.channel, lastMessageAt: now },
        update: { lastMessageAt: now },
      });

      const inbound = await this.saveInbound(tx, tenantId, conversation.id, message, now);
      if (!inbound) return null;
      if (inbound.created) {
        await recordEvent(tx, tenantId, {
          type: 'message.received',
          entityType: 'conversation',
          entityId: conversation.id,
          actor: { type: 'contact', id: contact.id },
          contactId: contact.id,
          payload: { messageType: message.type },
        });
      }

      const noticeShown = await tx.consent.count({
        where: { contactId: contact.id, kind: 'PRIVACY_NOTICE_SHOWN' },
      });
      const availability = await tx.availability.findMany({
        where: { professional: { active: true } },
        select: { weekday: true, startMinute: true, endMinute: true },
      });

      const state = conversation.botState as unknown as BotState | null;
      return {
        contactId: contact.id,
        conversationId: conversation.id,
        inboundId: inbound.id,
        state: state && typeof state === 'object' && 'step' in state ? state : null,
        paused: conversation.botPausedAt !== null,
        ctx: {
          businessName: tenant.name,
          ownerName: tenant.attendantName,
          timeZone: tenant.timezone,
          now,
          isFirstContact: noticeShown === 0,
          ownerAvailableNow: isOpenAt(availability, now, tenant.timezone),
          messages: readMessageOverrides(tenant.botMessages),
          faq: readFaq(tenant.faq),
        },
      };
    });
  }

  /**
   * Mensagem recebida é única por wamid. Se já existe e foi respondida, para aqui.
   * Se existe mas não foi respondida (queda no meio), continua com ela.
   */
  private async saveInbound(
    tx: TenantTx,
    tenantId: string,
    conversationId: string,
    message: InboundMessage,
    now: Date,
  ): Promise<{ id: string; created: boolean } | null> {
    const existing = await tx.message.findUnique({
      where: { tenantId_externalId: { tenantId, externalId: message.externalId } },
      select: { id: true, status: true },
    });
    if (existing) return existing.status === PROCESSED ? null : { id: existing.id, created: false };

    const created = await tx.message.create({
      data: {
        tenantId,
        conversationId,
        direction: 'INBOUND',
        externalId: message.externalId,
        type: message.type,
        body: message.body,
        payload: message.input.kind === 'choice' ? { choiceId: message.input.id } : Prisma.JsonNull,
        status: 'received',
        createdAt: now,
      },
    });
    return { id: created.id, created: true };
  }

  private saveOutbound(
    tx: TenantTx,
    tenantId: string,
    conversationId: string,
    reply: OutgoingMessage,
    createdAt: Date,
  ) {
    return tx.message.create({
      data: {
        tenantId,
        conversationId,
        direction: 'OUTBOUND',
        type: reply.type,
        body: reply.body,
        payload: reply as unknown as Prisma.InputJsonObject,
        status: 'pending',
        createdAt,
      },
    });
  }

  private async applyActions(
    tx: TenantTx,
    tenantId: string,
    p: Prepared,
    actions: BotAction[],
    channel: string,
    now: Date,
  ): Promise<void> {
    const actor = { type: 'contact' as const, id: p.contactId };
    for (const action of actions) {
      switch (action.type) {
        case 'privacy_notice_shown':
          await tx.consent.create({
            data: { tenantId, contactId: p.contactId, kind: 'PRIVACY_NOTICE_SHOWN', channel },
          });
          break;
        case 'opt_out':
          await tx.contact.update({ where: { id: p.contactId }, data: { optedOutAt: now } });
          await tx.consent.create({
            data: { tenantId, contactId: p.contactId, kind: 'OPT_OUT', channel },
          });
          await recordEvent(tx, tenantId, {
            type: 'contact.opted_out',
            entityType: 'contact',
            entityId: p.contactId,
            actor,
            contactId: p.contactId,
          });
          break;
        case 'opt_in':
          await tx.contact.update({ where: { id: p.contactId }, data: { optedOutAt: null } });
          await tx.consent.create({
            data: { tenantId, contactId: p.contactId, kind: 'OPT_IN', channel },
          });
          await recordEvent(tx, tenantId, {
            type: 'contact.opted_in',
            entityType: 'contact',
            entityId: p.contactId,
            actor,
            contactId: p.contactId,
          });
          break;
        case 'handoff': {
          await tx.conversation.update({
            where: { id: p.conversationId },
            data: { botPausedAt: now },
          });
          const contact = await tx.contact.findUniqueOrThrow({ where: { id: p.contactId } });
          await tx.task.create({
            data: {
              tenantId,
              contactId: p.contactId,
              title: `Responder ${contact.name ?? 'cliente'} no WhatsApp`,
              dueAt: now,
            },
          });
          await recordEvent(tx, tenantId, {
            type: 'handoff.requested',
            entityType: 'conversation',
            entityId: p.conversationId,
            actor,
            contactId: p.contactId,
            payload: { ownerAvailable: p.ctx.ownerAvailableNow },
          });
          break;
        }
        case 'faq_viewed':
          await recordEvent(tx, tenantId, {
            type: 'faq.viewed',
            entityType: 'conversation',
            entityId: p.conversationId,
            actor,
            contactId: p.contactId,
          });
          break;
      }
    }
  }

  private async markProcessed(tenantId: string, messageId: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.message.update({ where: { id: messageId }, data: { status: PROCESSED } }),
    );
  }

  /** Envia depois de gravar. Falha de envio fica marcada na mensagem, sem derrubar o resto. */
  private async deliver(
    tenantId: string,
    channel: MessagingChannel,
    to: string,
    messages: { id: string; payload: Prisma.JsonValue }[],
  ): Promise<void> {
    for (const message of messages) {
      let update: { status: string; externalId?: string | null };
      try {
        const { externalId } = await channel.send(
          to,
          message.payload as unknown as OutgoingMessage,
        );
        update = { status: externalId ? 'sent' : 'not_sent', externalId };
      } catch {
        update = { status: 'failed' };
      }
      await this.db.withTenant(tenantId, (tx) =>
        tx.message.update({ where: { id: message.id }, data: update }),
      );
    }
  }
}
