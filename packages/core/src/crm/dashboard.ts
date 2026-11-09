import { addDays, weekdayOf, type LocalDate } from '../scheduling/timezone.js';

/** Painéis (Premium): semana (segunda a domingo), mês ou trimestre, no fuso do negócio. */
export type DashboardPeriod = 'week' | 'month' | 'quarter';
export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = ['week', 'month', 'quarter'];

export interface PeriodRange {
  /** Primeiro dia do período. */
  from: LocalDate;
  /** Último dia do período (inclusive). */
  to: LocalDate;
  /** O período anterior, do mesmo tamanho de calendário, para comparar. */
  previous: { from: LocalDate; to: LocalDate };
}

function monthStart(date: LocalDate, plusMonths = 0): LocalDate {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + plusMonths;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export function periodRange(period: DashboardPeriod, today: LocalDate): PeriodRange {
  if (period === 'week') {
    const from = addDays(today, -((weekdayOf(today) + 6) % 7));
    return {
      from,
      to: addDays(from, 6),
      previous: { from: addDays(from, -7), to: addDays(from, -1) },
    };
  }
  const size = period === 'month' ? 1 : 3;
  const month = Number(today.slice(5, 7)) - 1;
  const offset = period === 'month' ? 0 : -(month % 3);
  const from = monthStart(today, offset);
  const next = monthStart(from, size);
  const prevFrom = monthStart(from, -size);
  return {
    from,
    to: addDays(next, -1),
    previous: { from: prevFrom, to: addDays(from, -1) },
  };
}

export interface FunnelStage {
  id: string;
  name: string;
  position: number;
  kind: 'OPEN' | 'WON' | 'LOST';
}

export interface FunnelStep {
  id: string;
  name: string;
  /** Atendimentos que chegaram até esta etapa (ou passaram dela). */
  reached: number;
  /** Do total que entrou no funil, quanto chegou aqui (0 a 100). */
  percent: number;
}

/**
 * Funil de conversão: dos atendimentos que entraram no período, quantos chegaram a cada etapa.
 * `reached` de cada atendimento são as etapas por onde passou (inclusive a atual). Etapas de
 * saída (Não seguiu) não entram no funil.
 */
export function conversionFunnel(
  stages: readonly FunnelStage[],
  deals: readonly { reached: readonly string[] }[],
): FunnelStep[] {
  const steps = [...stages]
    .filter((s) => s.kind !== 'LOST')
    .sort((a, b) => a.position - b.position);
  const furthest = deals.map((d) =>
    Math.max(-1, ...d.reached.map((id) => steps.findIndex((s) => s.id === id))),
  );
  const total = deals.length;
  return steps.map((s, i) => {
    const reached = furthest.filter((f) => f >= i).length;
    return {
      id: s.id,
      name: s.name,
      reached,
      percent: total === 0 ? 0 : Math.round((reached / total) * 100),
    };
  });
}

/** Variação em relação ao período anterior, em %. Nulo quando não há base. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Metas por período (Premium). Sem valor = sem meta. */
export interface PeriodGoals {
  newContacts?: number;
  wonCount?: number;
  doneCount?: number;
  revenueCents?: number;
}

export const GOAL_KEYS: readonly (keyof PeriodGoals)[] = [
  'newContacts',
  'wonCount',
  'doneCount',
  'revenueCents',
];

export function readPeriodGoals(raw: unknown): Record<DashboardPeriod, PeriodGoals> {
  const all = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const periods = (all.periods && typeof all.periods === 'object' ? all.periods : {}) as Record<
    string,
    unknown
  >;
  const one = (v: unknown): PeriodGoals => {
    const g = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out: PeriodGoals = {};
    for (const k of GOAL_KEYS) {
      const n = g[k];
      if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[k] = n;
    }
    return out;
  };
  // A meta do mês do Básico (atendimentos e faturamento) vale como ponto de partida.
  const month = {
    ...one({ doneCount: all.doneCount, revenueCents: all.revenueCents }),
    ...one(periods.month),
  };
  return { week: one(periods.week), month, quarter: one(periods.quarter) };
}
