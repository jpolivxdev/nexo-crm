import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { addDays, zonedToUtc } from '@nexo/core';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import type { timeOffBody } from './setup.schemas.js';

const ACTIVE = ['SCHEDULED', 'CONFIRMED'] as const;
const MAX_DAYS = 366;

/**
 * Folgas, férias e bloqueios da agenda. A disponibilidade já desconta (SchedulingService);
 * aqui a dona cria, vê e remove. Horários já marcados no período não mudam sozinhos:
 * a resposta lista quais são, para a dona remarcar ou cancelar.
 */
@Injectable()
export class TimeOffService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  list(tenantId: string, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const items = await tx.timeOff.findMany({
        where: { endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 100,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          reason: true,
          professional: { select: { id: true, name: true } },
        },
      });
      const professionals = await tx.professional.findMany({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      });
      return { timeZone: tenant.timezone, items, professionals };
    });
  }

  async create(tenantId: string, input: z.infer<typeof timeOffBody>, now = new Date()) {
    const result = await this.db.withTenant(tenantId, async (tx) => {
      const { timezone } = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const allDay = input.startTime == null;
      const startsAt = zonedToUtc(input.startDate, input.startTime ?? 0, timezone);
      const endsAt = allDay
        ? zonedToUtc(addDays(input.endDate, 1), 0, timezone)
        : zonedToUtc(input.endDate, input.endTime!, timezone);
      if (endsAt <= startsAt) throw new BadRequestException('O fim precisa ser depois do início.');
      if (endsAt <= now) throw new BadRequestException('Esse período já passou.');
      if (endsAt.getTime() - startsAt.getTime() > MAX_DAYS * 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Bloqueie no máximo um ano de cada vez.');
      }

      const professionalId = input.professionalId ?? null;
      if (professionalId) {
        // Chave estrangeira não passa pelo RLS: confere pelo RLS que é deste negócio.
        const found = await tx.professional.findUnique({ where: { id: professionalId } });
        if (!found) throw new NotFoundException('Profissional não encontrada.');
      }

      const timeOff = await tx.timeOff.create({
        data: { tenantId, professionalId, startsAt, endsAt, reason: input.reason || null },
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      });
      const conflicts = await tx.appointment.findMany({
        where: {
          status: { in: [...ACTIVE] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          ...(professionalId ? { professionalId } : {}),
        },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          startsAt: true,
          service: { select: { name: true } },
          contact: { select: { id: true, name: true, phone: true } },
        },
      });
      return { timeOff, conflicts };
    });
    this.bus.publish(tenantId, { type: 'agenda.changed' });
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.timeOff.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Bloqueio não encontrado.');
      await tx.timeOff.delete({ where: { id } });
    });
    this.bus.publish(tenantId, { type: 'agenda.changed' });
  }
}
