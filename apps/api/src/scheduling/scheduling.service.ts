import { Injectable } from '@nestjs/common';
import { availableSlots, dayRangeUtc, type LocalDate, utcToZoned } from '@nexo/core';
import type { Appointment, AppointmentStatus, Source } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import {
  AppointmentNotFoundError,
  ContactNotFoundError,
  InvalidAppointmentStateError,
  isOverlapViolation,
  ServiceNotFoundError,
  SlotUnavailableError,
} from './scheduling.errors.js';

/** Quem fez a ação. Vai para o log de eventos. */
export interface Actor {
  type: 'contact' | 'user' | 'system';
  id?: string;
}

export interface FreeSlot {
  startsAt: Date;
  endsAt: Date;
  /** Profissionais livres nesse horário, na ordem de preferência. */
  professionalIds: string[];
}

const ACTIVE: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];

/** Mudanças de status permitidas. Realizado e faltou podem ser corrigidos entre si pelo dono. */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['DONE', 'NO_SHOW', 'CANCELLED'],
  DONE: ['NO_SHOW'],
  NO_SHOW: ['DONE'],
  CANCELLED: [],
};

const EVENT_BY_STATUS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'appointment.created',
  CONFIRMED: 'appointment.confirmed',
  DONE: 'appointment.done',
  NO_SHOW: 'appointment.no_show',
  CANCELLED: 'appointment.cancelled',
};

@Injectable()
export class SchedulingService {
  constructor(private readonly db: Pick<PrismaService, 'withTenant'>) {}

  /** Horários livres de um serviço num dia (no fuso do negócio). */
  listSlots(
    tenantId: string,
    input: { serviceId: string; date: LocalDate; professionalId?: string; now?: Date },
  ): Promise<FreeSlot[]> {
    return this.db.withTenant(tenantId, (tx) =>
      this.computeSlots(tx, tenantId, { ...input, now: input.now ?? new Date() }),
    );
  }

  /** Marca um horário. Só aceita um horário que esteja livre agora. */
  book(
    tenantId: string,
    input: {
      contactId: string;
      serviceId: string;
      startsAt: Date;
      professionalId?: string;
      source: Source;
      actor: Actor;
      now?: Date;
    },
  ): Promise<Appointment> {
    return this.guardOverlap(() =>
      this.db.withTenant(tenantId, async (tx) => {
        // Chave estrangeira não passa pelo RLS: confere pelo RLS que a cliente é deste negócio.
        const contact = await tx.contact.findUnique({ where: { id: input.contactId } });
        if (!contact) throw new ContactNotFoundError();

        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const slot = await this.findFreeSlot(tx, tenantId, {
          serviceId: input.serviceId,
          startsAt: input.startsAt,
          professionalId: input.professionalId,
          timeZone: tenant.timezone,
          now: input.now ?? new Date(),
        });

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            contactId: input.contactId,
            serviceId: input.serviceId,
            professionalId: slot.professionalIds[0]!,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            source: input.source,
          },
        });
        await this.recordEvent(tx, tenantId, 'appointment.created', appointment, input.actor);
        return appointment;
      }),
    );
  }

  /** Remarca para outro horário livre. Prefere a mesma profissional. */
  reschedule(
    tenantId: string,
    appointmentId: string,
    input: { startsAt: Date; actor: Actor; now?: Date },
  ): Promise<Appointment> {
    return this.guardOverlap(() =>
      this.db.withTenant(tenantId, async (tx) => {
        const current = await this.loadActive(tx, appointmentId, 'SCHEDULED');
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const slot = await this.findFreeSlot(tx, tenantId, {
          serviceId: current.serviceId,
          startsAt: input.startsAt,
          timeZone: tenant.timezone,
          now: input.now ?? new Date(),
          ignoreAppointmentId: current.id,
        });
        const professionalId = slot.professionalIds.includes(current.professionalId)
          ? current.professionalId
          : slot.professionalIds[0]!;

        const updated = await tx.appointment.update({
          where: { id: current.id },
          // Remarcar volta para "marcado": a confirmação anterior era do horário antigo.
          data: {
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            professionalId,
            status: 'SCHEDULED',
          },
        });
        await this.recordEvent(tx, tenantId, 'appointment.rescheduled', updated, input.actor, {
          from: current.startsAt.toISOString(),
        });
        return updated;
      }),
    );
  }

  /** Muda o status: confirmar, cancelar, realizado ou faltou. */
  setStatus(
    tenantId: string,
    appointmentId: string,
    status: Exclude<AppointmentStatus, 'SCHEDULED'>,
    actor: Actor,
  ): Promise<Appointment> {
    return this.db.withTenant(tenantId, async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!current) throw new AppointmentNotFoundError();
      if (!TRANSITIONS[current.status].includes(status)) {
        throw new InvalidAppointmentStateError(current.status, status);
      }
      const updated = await tx.appointment.update({ where: { id: current.id }, data: { status } });
      await this.recordEvent(tx, tenantId, EVENT_BY_STATUS[status], updated, actor, {
        from: current.status,
      });
      return updated;
    });
  }

  // ---------- internos ----------

  private async computeSlots(
    tx: TenantTx,
    tenantId: string,
    input: {
      serviceId: string;
      date: LocalDate;
      professionalId?: string;
      now: Date;
      ignoreAppointmentId?: string;
      timeZone?: string;
    },
  ): Promise<FreeSlot[]> {
    const timeZone =
      input.timeZone ?? (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
    const service = await tx.service.findFirst({
      where: { id: input.serviceId, active: true },
      include: {
        professionals: {
          where: {
            professional: { active: true },
            ...(input.professionalId ? { professionalId: input.professionalId } : {}),
          },
          include: { professional: { include: { availability: true } } },
          orderBy: { professional: { createdAt: 'asc' } },
        },
      },
    });
    if (!service) throw new ServiceNotFoundError();

    const day = dayRangeUtc(input.date, timeZone);
    const professionalIds = service.professionals.map((p) => p.professionalId);
    const [appointments, timeOff] = await Promise.all([
      tx.appointment.findMany({
        where: {
          professionalId: { in: professionalIds },
          status: { in: ACTIVE },
          startsAt: { lt: day.endsAt },
          endsAt: { gt: day.startsAt },
          ...(input.ignoreAppointmentId ? { id: { not: input.ignoreAppointmentId } } : {}),
        },
        select: { professionalId: true, startsAt: true, endsAt: true },
      }),
      tx.timeOff.findMany({
        where: {
          OR: [{ professionalId: { in: professionalIds } }, { professionalId: null }],
          startsAt: { lt: day.endsAt },
          endsAt: { gt: day.startsAt },
        },
        select: { professionalId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const byStart = new Map<number, FreeSlot>();
    for (const { professional } of service.professionals) {
      const busy = [...appointments, ...timeOff].filter(
        (b) => b.professionalId === professional.id || b.professionalId === null,
      );
      const slots = availableSlots({
        date: input.date,
        timeZone,
        durationMinutes: service.durationMinutes,
        availability: professional.availability,
        busy,
        now: input.now,
      });
      for (const slot of slots) {
        const key = slot.startsAt.getTime();
        const existing = byStart.get(key);
        if (existing) existing.professionalIds.push(professional.id);
        else byStart.set(key, { ...slot, professionalIds: [professional.id] });
      }
    }
    return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  private async findFreeSlot(
    tx: TenantTx,
    tenantId: string,
    input: {
      serviceId: string;
      startsAt: Date;
      professionalId?: string;
      timeZone: string;
      now: Date;
      ignoreAppointmentId?: string;
    },
  ): Promise<FreeSlot> {
    const date = utcToZoned(input.startsAt, input.timeZone).date;
    const slots = await this.computeSlots(tx, tenantId, { ...input, date });
    const slot = slots.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
    if (!slot) throw new SlotUnavailableError();
    return slot;
  }

  private async loadActive(tx: TenantTx, appointmentId: string, to: AppointmentStatus) {
    const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!current) throw new AppointmentNotFoundError();
    if (!ACTIVE.includes(current.status)) {
      throw new InvalidAppointmentStateError(current.status, to);
    }
    return current;
  }

  private recordEvent(
    tx: TenantTx,
    tenantId: string,
    type: string,
    appointment: Appointment,
    actor: Actor,
    extra: Record<string, string> = {},
  ) {
    return tx.event.create({
      data: {
        tenantId,
        type,
        entityType: 'appointment',
        entityId: appointment.id,
        actorType: actor.type,
        actorId: actor.id ?? null,
        payload: {
          contactId: appointment.contactId,
          startsAt: appointment.startsAt.toISOString(),
          status: appointment.status,
          ...extra,
        },
      },
    });
  }

  /** Corrida entre dois pedidos: o banco barra o segundo, e a gente responde como horário ocupado. */
  private async guardOverlap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isOverlapViolation(error)) throw new SlotUnavailableError();
      throw error;
    }
  }
}
