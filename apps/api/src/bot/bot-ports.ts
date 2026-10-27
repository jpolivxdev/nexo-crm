import {
  addDays,
  type AppointmentSummary,
  type BookResult,
  type BotPorts,
  type LocalDate,
} from '@nexo/core';
import type { PrismaService } from '../database/prisma.service.js';
import { SlotUnavailableError } from '../scheduling/scheduling.errors.js';
import type { SchedulingService } from '../scheduling/scheduling.service.js';

/**
 * Liga o robô (puro, em @nexo/core) à agenda real de um negócio, em nome de uma cliente.
 * Tudo passa por withTenant (RLS). IDs que chegam do WhatsApp são tratados como não confiáveis:
 * a cliente só remarca e cancela os próprios horários.
 */
export function createBotPorts(deps: {
  db: Pick<PrismaService, 'withTenant'>;
  scheduling: SchedulingService;
  tenantId: string;
  contactId: string;
  now: () => Date;
}): BotPorts {
  const { db, scheduling, tenantId, contactId, now } = deps;
  const actor = { type: 'contact' as const, id: contactId };

  async function ownsActiveAppointment(appointmentId: string): Promise<boolean> {
    const appt = await db.withTenant(tenantId, (tx) =>
      tx.appointment.findFirst({
        where: { id: appointmentId, contactId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        select: { id: true },
      }),
    );
    return appt !== null;
  }

  async function bookOrTaken(fn: () => Promise<unknown>): Promise<BookResult> {
    try {
      await fn();
      return { ok: true };
    } catch (error) {
      if (error instanceof SlotUnavailableError) return { ok: false, reason: 'slot_taken' };
      throw error;
    }
  }

  return {
    listServices: () =>
      db.withTenant(tenantId, (tx) =>
        tx.service.findMany({
          where: { active: true, professionals: { some: { professional: { active: true } } } },
          select: { id: true, name: true, durationMinutes: true },
          orderBy: { name: 'asc' },
        }),
      ),

    listProfessionals: async (serviceId) => {
      const links = await db.withTenant(tenantId, (tx) =>
        tx.professionalService.findMany({
          where: { serviceId, professional: { active: true } },
          select: { professional: { select: { id: true, name: true } } },
          orderBy: { professional: { createdAt: 'asc' } },
        }),
      );
      return links.map((l) => l.professional);
    },

    listDates: async ({ serviceId, professionalId, from, days, ignoreAppointmentId }) => {
      const dates: LocalDate[] = [];
      for (let i = 0; i < days; i++) {
        const date = addDays(from, i);
        const slots = await scheduling.listSlots(tenantId, {
          serviceId,
          professionalId,
          date,
          now: now(),
          ignoreAppointmentId,
        });
        if (slots.length > 0) dates.push(date);
      }
      return dates;
    },

    listSlots: async ({ serviceId, professionalId, date, ignoreAppointmentId }) => {
      const slots = await scheduling.listSlots(tenantId, {
        serviceId,
        professionalId,
        date,
        now: now(),
        ignoreAppointmentId,
      });
      return slots.map((s) => s.startsAt);
    },

    book: ({ serviceId, professionalId, startsAt }) =>
      bookOrTaken(() =>
        scheduling.book(tenantId, {
          contactId,
          serviceId,
          professionalId,
          startsAt,
          source: 'WHATSAPP',
          actor,
          now: now(),
        }),
      ),

    upcoming: async (): Promise<AppointmentSummary[]> => {
      const appts = await db.withTenant(tenantId, (tx) =>
        tx.appointment.findMany({
          where: {
            contactId,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            startsAt: { gte: now() },
          },
          include: { service: { select: { name: true } } },
          orderBy: { startsAt: 'asc' },
          take: 10,
        }),
      );
      return appts.map((a) => ({
        id: a.id,
        serviceId: a.serviceId,
        serviceName: a.service.name,
        startsAt: a.startsAt,
      }));
    },

    reschedule: async ({ appointmentId, startsAt }) => {
      if (!(await ownsActiveAppointment(appointmentId))) return { ok: false, reason: 'slot_taken' };
      return bookOrTaken(() =>
        scheduling.reschedule(tenantId, appointmentId, { startsAt, actor, now: now() }),
      );
    },

    cancel: async (appointmentId) => {
      if (!(await ownsActiveAppointment(appointmentId))) return;
      await scheduling.setStatus(tenantId, appointmentId, 'CANCELLED', actor);
    },

    confirm: async (appointmentId) => {
      const appt = await db.withTenant(tenantId, (tx) =>
        tx.appointment.findFirst({
          where: { id: appointmentId, contactId, status: 'SCHEDULED' },
          select: { id: true },
        }),
      );
      // Já confirmado (ou não é desta cliente): nada a fazer.
      if (!appt) return;
      await scheduling.setStatus(tenantId, appointmentId, 'CONFIRMED', actor);
    },
  };
}
