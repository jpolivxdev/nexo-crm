import { Inject, Injectable } from '@nestjs/common';
import { addDays, dayRangeUtc, todayIn, utcToZoned, type LocalDate } from '@nexo/core';
import { PrismaService } from '../database/prisma.service.js';

/** Períodos que o painel oferece. */
export const REPORT_PERIODS = [7, 30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Faltas sobre os atendimentos que já aconteceram (realizado + faltou). Nulo sem base. */
export function noShowRate(done: number, noShow: number): number | null {
  const base = done + noShow;
  return base === 0 ? null : Math.round((noShow / base) * 100);
}

export interface DailyCount {
  date: LocalDate;
  /** Horários marcados naquele dia (pela data em que a cliente marcou). */
  booked: number;
  /** Atendimentos realizados naquele dia (pela data do horário). */
  done: number;
}

/** Um ponto por dia do período, inclusive os dias sem nada (zero), no fuso do negócio. */
export function dailySeries(
  from: LocalDate,
  to: LocalDate,
  timeZone: string,
  booked: Date[],
  done: Date[],
): DailyCount[] {
  const days = new Map<LocalDate, DailyCount>();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, { date: d, booked: 0, done: 0 });
  for (const at of booked) {
    const day = days.get(utcToZoned(at, timeZone).date);
    if (day) day.booked += 1;
  }
  for (const at of done) {
    const day = days.get(utcToZoned(at, timeZone).date);
    if (day) day.done += 1;
  }
  return [...days.values()];
}

/**
 * Relatório mínimo da Fase 1 (M9): o que a piloto precisa medir no portão
 * (agendamentos pelo robô, faltas, passagens para a equipe, pedidos de "parar").
 * Tudo calculado na hora a partir das tabelas do negócio, sempre com RLS.
 */
@Injectable()
export class ReportService {
  constructor(@Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant'>) {}

  summary(tenantId: string, days: ReportPeriod, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const to = todayIn(tenant.timezone, now);
      const from = addDays(to, -(days - 1));
      const range = {
        gte: dayRangeUtc(from, tenant.timezone).startsAt,
        lt: dayRangeUtc(to, tenant.timezone).endsAt,
      };
      // Atendimentos que já passaram: os futuros ainda não podem ter faltado.
      const past = { gte: range.gte, lt: now < range.lt ? now : range.lt };

      // Em sequência: as consultas dividem a mesma conexão da transação.
      const newContacts = await tx.contact.count({ where: { createdAt: range } });
      const bookedBySource = await tx.appointment.groupBy({
        by: ['source'],
        where: { createdAt: range },
        _count: { _all: true },
      });
      const outcomes = await tx.appointment.groupBy({
        by: ['status'],
        where: { startsAt: past },
        _count: { _all: true },
      });
      // Só as datas, para o gráfico por dia. No volume de um estúdio, 90 dias cabem com folga.
      const bookedDates = await tx.appointment.findMany({
        where: { createdAt: range },
        select: { createdAt: true },
      });
      const doneDates = await tx.appointment.findMany({
        where: { startsAt: past, status: 'DONE' },
        select: { startsAt: true },
      });
      const events = await tx.event.groupBy({
        by: ['type', 'actorType'],
        where: {
          createdAt: range,
          type: { in: ['handoff.requested', 'contact.opted_out', 'appointment.confirmed'] },
        },
        _count: { _all: true },
      });
      const byProfessional = await tx.appointment.groupBy({
        by: ['professionalId'],
        where: { startsAt: range, status: { not: 'CANCELLED' } },
        _count: { _all: true },
      });
      const professionals = await tx.professional.findMany({
        where: { id: { in: byProfessional.map((p) => p.professionalId) } },
        select: { id: true, name: true },
      });
      const stages = await tx.stage.findMany({
        where: { pipeline: { isDefault: true } },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          _count: { select: { deals: { where: { closedAt: null } } } },
        },
      });

      const bySource = (s: string) => bookedBySource.find((b) => b.source === s)?._count._all ?? 0;
      const byStatus = (s: string) => outcomes.find((o) => o.status === s)?._count._all ?? 0;
      const eventCount = (type: string, actorType?: string) =>
        events
          .filter((e) => e.type === type && (!actorType || e.actorType === actorType))
          .reduce((sum, e) => sum + e._count._all, 0);
      const booked = bookedBySource.reduce((sum, b) => sum + b._count._all, 0);
      const done = byStatus('DONE');
      const noShow = byStatus('NO_SHOW');

      return {
        from,
        to,
        days,
        newContacts,
        booked: { total: booked, byBot: bySource('WHATSAPP'), byPanel: bySource('PANEL') },
        outcomes: {
          done,
          noShow,
          cancelled: byStatus('CANCELLED'),
          noShowRate: noShowRate(done, noShow),
        },
        handoffs: eventCount('handoff.requested'),
        optOuts: eventCount('contact.opted_out'),
        confirmedByClient: eventCount('appointment.confirmed', 'contact'),
        daily: dailySeries(
          from,
          to,
          tenant.timezone,
          bookedDates.map((a) => a.createdAt),
          doneDates.map((a) => a.startsAt),
        ),
        byStage: stages.map((s) => ({ id: s.id, name: s.name, count: s._count.deals })),
        byProfessional: byProfessional
          .map((p) => ({
            id: p.professionalId,
            name: professionals.find((x) => x.id === p.professionalId)?.name ?? '',
            count: p._count._all,
          }))
          .sort((a, b) => b.count - a.count),
      };
    });
  }
}
