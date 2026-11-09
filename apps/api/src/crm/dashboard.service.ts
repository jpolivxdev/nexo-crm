import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  change,
  conversionFunnel,
  dayRangeUtc,
  forecast,
  GOAL_KEYS,
  periodRange,
  readPeriodGoals,
  todayIn,
  type DashboardPeriod,
  type LocalDate,
  type PeriodGoals,
} from '@nexo/core';
import { AuditService } from '../auth/audit.service.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CrmActor } from './crm.service.js';

export interface DashboardFilter {
  period: DashboardPeriod;
  pipelineId?: string;
  ownerUserId?: string;
}

interface Range {
  gte: Date;
  lt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stageChange(payload: unknown): { to: string } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const to = (payload as Record<string, unknown>).to;
  return typeof to === 'string' && UUID.test(to) ? { to } : null;
}

/**
 * Painéis (Premium): números do período com o anterior para comparar, metas por semana, mês e
 * trimestre, funil de conversão, quem está cuidando de quê e a previsão. Também o painel geral
 * do Hoje. Tudo calculado na hora, no negócio da sessão (withTenant + RLS).
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private range(from: LocalDate, to: LocalDate, today: LocalDate, tz: string): Range {
    const end = to < today ? to : today;
    return { gte: dayRangeUtc(from, tz).startsAt, lt: dayRangeUtc(end, tz).endsAt };
  }

  private async numbers(
    tx: TenantTx,
    range: Range,
    stageKinds: Map<string, string>,
    filter: DashboardFilter,
  ) {
    const dealWhere = {
      ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
      ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
    };
    const [newContacts, newDeals, changes, done, noShow] = await Promise.all([
      tx.contact.count({ where: { createdAt: range } }),
      tx.deal.count({ where: { ...dealWhere, createdAt: range } }),
      tx.event.findMany({
        where: { type: 'deal.stage_changed', createdAt: range },
        select: { entityId: true, payload: true },
      }),
      tx.appointment.findMany({
        where: { status: 'DONE', startsAt: range },
        select: { service: { select: { priceCents: true } } },
      }),
      tx.appointment.count({ where: { status: 'NO_SHOW', startsAt: range } }),
    ]);
    const wonIds = new Set<string>();
    const lostIds = new Set<string>();
    for (const e of changes) {
      const c = stageChange(e.payload);
      const kind = c ? stageKinds.get(c.to) : undefined;
      if (kind === 'WON') wonIds.add(e.entityId);
      if (kind === 'LOST') lostIds.add(e.entityId);
    }
    const scoped = await tx.deal.findMany({
      where: { ...dealWhere, id: { in: [...wonIds, ...lostIds] } },
      select: { id: true, valueCents: true },
    });
    const inScope = new Set(scoped.map((d) => d.id));
    const won = scoped.filter((d) => wonIds.has(d.id));
    const lostCount = [...lostIds].filter((id) => inScope.has(id) && !wonIds.has(id)).length;
    const revenueCents = done.reduce((s, a) => s + (a.service.priceCents ?? 0), 0);
    return {
      newContacts,
      newDeals,
      wonCount: won.length,
      wonCents: won.reduce((s, d) => s + (d.valueCents ?? 0), 0),
      lostCount,
      conversion:
        won.length + lostCount === 0
          ? null
          : Math.round((won.length / (won.length + lostCount)) * 100),
      doneCount: done.length,
      revenueCents,
      noShowCount: noShow,
      averageTicketCents: done.length === 0 ? null : Math.round(revenueCents / done.length),
    };
  }

  dashboard(tenantId: string, filter: DashboardFilter, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true, goals: true },
      });
      const tz = tenant.timezone;
      const today = todayIn(tz, now);
      const period = periodRange(filter.period, today);
      const pipelines = await tx.pipeline.findMany({
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isDefault: true,
          stages: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true, kind: true, probability: true },
          },
        },
      });
      const pipeline = filter.pipelineId
        ? pipelines.find((p) => p.id === filter.pipelineId)
        : pipelines.find((p) => p.isDefault);
      if (!pipeline) throw new NotFoundException('Funil não encontrado.');
      const stageKinds = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s.kind])));
      const stageInfo = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s])));

      const current = this.range(period.from, period.to, today, tz);
      const previous = this.range(period.previous.from, period.previous.to, today, tz);
      const [now_, before] = [
        await this.numbers(tx, current, stageKinds, filter),
        await this.numbers(tx, previous, stageKinds, filter),
      ];

      // Funil de conversão: atendimentos que entraram no período neste funil.
      const entered = await tx.deal.findMany({
        where: {
          pipelineId: pipeline.id,
          createdAt: current,
          ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        },
        select: { id: true, stageId: true },
      });
      const history = entered.length
        ? await tx.event.findMany({
            where: { type: 'deal.stage_changed', entityId: { in: entered.map((d) => d.id) } },
            select: { entityId: true, payload: true },
          })
        : [];
      const funnel = conversionFunnel(
        pipeline.stages,
        entered.map((d) => ({
          reached: [
            d.stageId,
            ...history
              .filter((h) => h.entityId === d.id)
              .map((h) => stageChange(h.payload)?.to)
              .filter((x): x is string => Boolean(x)),
          ],
        })),
      );

      // Por responsável.
      const people = await tx.user.findMany({
        where: { tenantId, role: { in: ['OWNER', 'MANAGER', 'CONSULTANT', 'STAFF'] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      const open = await tx.deal.findMany({
        where: {
          closedAt: null,
          ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
          ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        },
        select: { ownerUserId: true, valueCents: true, stageId: true, expectedCloseOn: true },
      });
      const openTasks = await tx.task.groupBy({
        by: ['assigneeUserId'],
        where: { doneAt: null },
        _count: { _all: true },
      });
      const openOnly = open.filter((d) => stageInfo.get(d.stageId)?.kind === 'OPEN');
      const byOwner = [...people, { id: null, name: 'Sem responsável' }]
        .map((p) => {
          const mine = openOnly.filter((d) => d.ownerUserId === p.id);
          return {
            id: p.id,
            name: p.name,
            openDeals: mine.length,
            openCents: mine.reduce((s, d) => s + (d.valueCents ?? 0), 0),
            openTasks: openTasks.find((t) => t.assigneeUserId === p.id)?._count._all ?? 0,
          };
        })
        .filter((p) => p.openDeals > 0 || p.openTasks > 0);

      const goals = readPeriodGoals(tenant.goals)[filter.period];
      return {
        period: filter.period,
        from: period.from,
        to: period.to,
        timeZone: tz,
        pipeline: { id: pipeline.id, name: pipeline.name },
        pipelines: pipelines.map(({ id, name, isDefault }) => ({ id, name, isDefault })),
        people,
        numbers: now_,
        previous: before,
        changes: {
          newContacts: change(now_.newContacts, before.newContacts),
          wonCount: change(now_.wonCount, before.wonCount),
          doneCount: change(now_.doneCount, before.doneCount),
          revenueCents: change(now_.revenueCents, before.revenueCents),
        },
        goals,
        progress: {
          newContacts: now_.newContacts,
          wonCount: now_.wonCount,
          doneCount: now_.doneCount,
          revenueCents: now_.revenueCents,
        },
        funnel,
        byOwner,
        forecast: forecast(
          open.map((d) => {
            const s = stageInfo.get(d.stageId);
            return {
              valueCents: d.valueCents,
              probability: s?.probability ?? null,
              stageKind: s?.kind ?? 'OPEN',
              expectedCloseOn: d.expectedCloseOn
                ? d.expectedCloseOn.toISOString().slice(0, 10)
                : null,
            };
          }),
        ),
      };
    });
  }

  async saveGoals(tenantId: string, period: DashboardPeriod, goals: PeriodGoals, actor: CrmActor) {
    const clean: PeriodGoals = {};
    for (const k of GOAL_KEYS) if (goals[k]) clean[k] = goals[k];
    await this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { goals: true },
      });
      const raw = (tenant.goals && typeof tenant.goals === 'object' ? tenant.goals : {}) as Record<
        string,
        unknown
      >;
      const periods = { ...readPeriodGoals(raw), [period]: clean };
      // A meta do mês também é a do Básico (tela Resultados).
      const base =
        period === 'month'
          ? { doneCount: clean.doneCount, revenueCents: clean.revenueCents }
          : { doneCount: raw.doneCount, revenueCents: raw.revenueCents };
      await tx.tenant.update({
        where: { id: tenantId },
        data: { goals: JSON.parse(JSON.stringify({ ...base, periods })) as object },
      });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'goals.updated',
      ip: actor.ip,
      metadata: { period, ...clean },
    });
    return { period, goals: clean };
  }

  /** Painel geral do Hoje: etapas do funil principal, previsão, receita do mês e chamados. */
  overview(tenantId: string, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const today = todayIn(tenant.timezone, now);
      const month = periodRange('month', today);
      const range = this.range(month.from, month.to, today, tenant.timezone);
      const main = await tx.pipeline.findFirst({
        where: { isDefault: true },
        select: {
          stages: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              kind: true,
              _count: { select: { deals: { where: { closedAt: null } } } },
            },
          },
        },
      });
      const open = await tx.deal.findMany({
        where: { closedAt: null },
        select: {
          valueCents: true,
          expectedCloseOn: true,
          stage: { select: { kind: true, probability: true } },
        },
      });
      const done = await tx.appointment.findMany({
        where: { status: 'DONE', startsAt: range },
        select: { service: { select: { priceCents: true } } },
      });
      const tickets = await tx.supportTicket.count({
        where: { status: { in: ['OPEN', 'ANSWERED'] } },
      });
      return {
        stages: (main?.stages ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          count: s._count.deals,
        })),
        forecast: forecast(
          open.map((d) => ({
            valueCents: d.valueCents,
            probability: d.stage.probability,
            stageKind: d.stage.kind,
            expectedCloseOn: d.expectedCloseOn
              ? d.expectedCloseOn.toISOString().slice(0, 10)
              : null,
          })),
        ),
        monthRevenueCents: done.reduce((s, a) => s + (a.service.priceCents ?? 0), 0),
        openTickets: tickets,
      };
    });
  }
}
