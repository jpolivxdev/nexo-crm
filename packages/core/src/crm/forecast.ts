/**
 * Previsão do CRM (Premium). Conta só atendimentos em aberto em etapas de andamento.
 * Em aberto: soma dos valores. Previsão: cada valor vezes a chance da etapa (0 a 100);
 * etapa sem chance fica fora da previsão, mas entra no em aberto.
 */
export interface ForecastDeal {
  valueCents: number | null;
  /** Chance da etapa, de 0 a 100. */
  probability: number | null;
  stageKind: 'OPEN' | 'WON' | 'LOST';
  /** Previsão de fechamento, AAAA-MM-DD. */
  expectedCloseOn: string | null;
}

export interface ForecastBucket {
  /** AAAA-MM, ou null para "sem data". */
  month: string | null;
  count: number;
  openCents: number;
  weightedCents: number;
}

export interface Forecast {
  count: number;
  openCents: number;
  weightedCents: number;
  /** Por mês da previsão de fechamento, do mais cedo ao mais tarde; "sem data" por último. */
  byMonth: ForecastBucket[];
}

const clampChance = (p: number | null) => (p == null ? 0 : Math.min(100, Math.max(0, p)));

export function forecast(deals: readonly ForecastDeal[]): Forecast {
  const buckets = new Map<string | null, ForecastBucket>();
  let count = 0;
  let openCents = 0;
  let weightedCents = 0;
  for (const deal of deals) {
    if (deal.stageKind !== 'OPEN') continue;
    const value = Math.max(0, deal.valueCents ?? 0);
    const weighted = Math.round((value * clampChance(deal.probability)) / 100);
    const month = deal.expectedCloseOn ? deal.expectedCloseOn.slice(0, 7) : null;
    const bucket = buckets.get(month) ?? { month, count: 0, openCents: 0, weightedCents: 0 };
    bucket.count += 1;
    bucket.openCents += value;
    bucket.weightedCents += weighted;
    buckets.set(month, bucket);
    count += 1;
    openCents += value;
    weightedCents += weighted;
  }
  const byMonth = [...buckets.values()].sort((a, b) => {
    if (a.month === b.month) return 0;
    if (a.month === null) return 1;
    if (b.month === null) return -1;
    return a.month < b.month ? -1 : 1;
  });
  return { count, openCents, weightedCents, byMonth };
}
