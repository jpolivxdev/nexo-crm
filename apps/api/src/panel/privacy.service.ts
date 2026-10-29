import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../auth/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

export interface PrivacyActor {
  userId: string;
  ip: string | null;
}

/** Telefone que fica no lugar do verdadeiro: único por cliente e sem dado pessoal. */
export const erasedPhone = (contactId: string) => `excluida-${contactId}`;

/**
 * Direitos da cliente final (LGPD): baixar e excluir os dados dela.
 * Excluir apaga nome, telefone, anotações, conversas e lembretes da cliente e deixa só
 * um registro anônimo, para horários passados, etapas e relatórios continuarem certos.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  /** Tudo o que o negócio guarda sobre a cliente, num formato que ela consiga ler. */
  async export(tenantId: string, contactId: string, actor: PrivacyActor) {
    const data = await this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, erasedAt: null },
        select: {
          name: true,
          phone: true,
          tags: true,
          notes: true,
          optedOutAt: true,
          source: true,
          createdAt: true,
          consents: {
            orderBy: { createdAt: 'asc' },
            select: { kind: true, channel: true, createdAt: true },
          },
          appointments: {
            orderBy: { startsAt: 'asc' },
            select: {
              startsAt: true,
              endsAt: true,
              status: true,
              source: true,
              notes: true,
              service: { select: { name: true } },
              professional: { select: { name: true } },
            },
          },
          deals: {
            where: { closedAt: null },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { stage: { select: { name: true } } },
          },
          conversations: {
            select: {
              channel: true,
              createdAt: true,
              messages: {
                orderBy: { createdAt: 'asc' },
                select: { direction: true, type: true, body: true, createdAt: true },
              },
            },
          },
          tasks: {
            orderBy: { createdAt: 'asc' },
            select: { title: true, dueAt: true, doneAt: true },
          },
        },
      });
      if (!contact) throw new NotFoundException('Cliente não encontrada.');
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, timezone: true },
      });
      const history = await tx.event.findMany({
        where: { payload: { path: ['contactId'], equals: contactId } },
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true },
      });
      const { deals, appointments, consents, conversations, tasks, ...rest } = contact;
      return {
        exportedAt: new Date().toISOString(),
        business: tenant.name,
        timeZone: tenant.timezone,
        contact: rest,
        stage: deals[0]?.stage.name ?? null,
        consents,
        conversations,
        tasks,
        appointments: appointments.map(({ service, professional, ...a }) => ({
          ...a,
          service: service.name,
          professional: professional.name,
        })),
        history,
      };
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'contact.export',
      ip: actor.ip,
      metadata: { contactId },
    });
    return data;
  }

  async erase(tenantId: string, contactId: string, actor: PrivacyActor, now = new Date()) {
    const summary = await this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, erasedAt: null },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Cliente não encontrada.');

      // Horários que ainda vão acontecer são cancelados, e o horário volta a ficar livre.
      const cancelled = await tx.appointment.updateMany({
        where: { contactId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gt: now } },
        data: { status: 'CANCELLED' },
      });
      await tx.reminder.updateMany({
        where: { appointment: { contactId }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.appointment.updateMany({ where: { contactId }, data: { notes: null } });

      const conversations = await tx.conversation.findMany({
        where: { contactId },
        select: { id: true },
      });
      const messages = await tx.message.deleteMany({
        where: { conversationId: { in: conversations.map((c) => c.id) } },
      });
      await tx.conversation.deleteMany({ where: { contactId } });
      // Lembretes da dona podem ter o nome da cliente no título.
      await tx.task.deleteMany({ where: { contactId } });
      // Sai do quadro de etapas sem mudar a etapa em que estava.
      await tx.deal.updateMany({ where: { contactId, closedAt: null }, data: { closedAt: now } });

      await tx.contact.update({
        where: { id: contactId },
        data: {
          name: null,
          phone: erasedPhone(contactId),
          tags: [],
          notes: null,
          erasedAt: now,
        },
      });
      // Eventos guardam só IDs e tipos, sem dado pessoal: ficam para os relatórios.
      await tx.event.create({
        data: {
          tenantId,
          type: 'contact.erased',
          entityType: 'contact',
          entityId: contactId,
          actorType: 'user',
          actorId: actor.userId,
          payload: { contactId },
        },
      });
      return { cancelledAppointments: cancelled.count, deletedMessages: messages.count };
    });

    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'contact.erase',
      ip: actor.ip,
      metadata: { contactId, ...summary },
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: contactId });
    if (summary.cancelledAppointments > 0) this.bus.publish(tenantId, { type: 'agenda.changed' });
    return summary;
  }
}
