/**
 * Carteira de clientes (Premium): quem já foi atendida e como está a volta dela.
 * Em dia: tem horário marcado, ou voltou dentro do esperado.
 * Atenção: passou do intervalo de costume (ou de `attentionDays` sem intervalo conhecido).
 * Em risco: mais de `riskDays` sem vir. Perdida: mais de `lostDays`.
 */
export interface PortfolioRules {
  attentionDays: number;
  riskDays: number;
  lostDays: number;
}

/** Padrão: 45 dias é a "sumida" que a piloto escolheu (29/10/2026). */
export const DEFAULT_PORTFOLIO_RULES: PortfolioRules = {
  attentionDays: 30,
  riskDays: 45,
  lostDays: 90,
};

export type PortfolioStatus = 'ok' | 'attention' | 'risk' | 'lost';

export function portfolioRulesOf(raw: unknown): PortfolioRules {
  const out = { ...DEFAULT_PORTFOLIO_RULES };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of Object.keys(out) as (keyof PortfolioRules)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 730) out[key] = v;
    }
  }
  return out;
}

export function checkPortfolioRules(r: PortfolioRules): string | null {
  if (!(r.attentionDays < r.riskDays && r.riskDays < r.lostDays))
    return 'Os dias precisam crescer: atenção, depois risco, depois perdida.';
  return null;
}

const DAY = 86_400_000;

/** Intervalo médio, em dias, entre atendimentos realizados (nulo com menos de dois). */
export function averageInterval(doneDates: readonly Date[]): number | null {
  if (doneDates.length < 2) return null;
  const sorted = [...doneDates].sort((a, b) => a.getTime() - b.getTime());
  const span = sorted[sorted.length - 1]!.getTime() - sorted[0]!.getTime();
  return Math.round(span / DAY / (sorted.length - 1));
}

export function portfolioStatus(input: {
  lastDoneAt: Date;
  hasNext: boolean;
  avgIntervalDays: number | null;
  now: Date;
  rules: PortfolioRules;
}): { status: PortfolioStatus; daysSince: number } {
  const daysSince = Math.floor((input.now.getTime() - input.lastDoneAt.getTime()) / DAY);
  if (input.hasNext) return { status: 'ok', daysSince };
  const { rules } = input;
  if (daysSince > rules.lostDays) return { status: 'lost', daysSince };
  if (daysSince > rules.riskDays) return { status: 'risk', daysSince };
  // Quem costuma voltar a cada 21 dias já merece atenção aos 26; sem costume, vale a regra.
  const attentionAt =
    input.avgIntervalDays !== null
      ? Math.min(rules.attentionDays, Math.round(input.avgIntervalDays * 1.25))
      : rules.attentionDays;
  if (daysSince > attentionAt) return { status: 'attention', daysSince };
  return { status: 'ok', daysSince };
}
