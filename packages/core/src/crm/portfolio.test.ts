import { describe, expect, it } from 'vitest';
import {
  averageInterval,
  checkPortfolioRules,
  DEFAULT_PORTFOLIO_RULES as R,
  portfolioRulesOf,
  portfolioStatus,
} from './portfolio.js';

const now = new Date('2026-11-09T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('carteira de clientes', () => {
  it('intervalo médio', () => {
    expect(averageInterval([ago(42), ago(0), ago(21)])).toBe(21);
    expect(averageInterval([ago(3)])).toBeNull();
  });

  it('em dia, atenção pelo costume, risco e perdida', () => {
    const s = (days: number, avg: number | null, hasNext = false) =>
      portfolioStatus({ lastDoneAt: ago(days), hasNext, avgIntervalDays: avg, now, rules: R })
        .status;
    expect(s(20, 21)).toBe('ok');
    expect(s(27, 21)).toBe('attention');
    expect(s(27, null)).toBe('ok');
    expect(s(31, null)).toBe('attention');
    expect(s(50, 21)).toBe('risk');
    expect(s(100, 21)).toBe('lost');
    expect(s(100, 21, true)).toBe('ok');
  });

  it('regras salvas: só números válidos e em ordem', () => {
    expect(portfolioRulesOf({ riskDays: 60, lostDays: 'x' })).toEqual({ ...R, riskDays: 60 });
    expect(checkPortfolioRules({ attentionDays: 50, riskDays: 45, lostDays: 90 })).not.toBeNull();
    expect(checkPortfolioRules(R)).toBeNull();
  });
});
