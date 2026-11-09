import { describe, expect, it } from 'vitest';
import { change, conversionFunnel, periodRange, readPeriodGoals } from './dashboard.js';

describe('painéis', () => {
  it('semana de segunda a domingo, mês e trimestre com o anterior', () => {
    // 09/11/2026 é segunda.
    expect(periodRange('week', '2026-11-11')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      previous: { from: '2026-11-02', to: '2026-11-08' },
    });
    expect(periodRange('month', '2026-03-31')).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
      previous: { from: '2026-02-01', to: '2026-02-28' },
    });
    expect(periodRange('quarter', '2026-11-09')).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
      previous: { from: '2026-07-01', to: '2026-09-30' },
    });
    expect(periodRange('quarter', '2027-01-15').previous).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
  });

  it('funil conta quem chegou a cada etapa, sem a de saída', () => {
    const stages = [
      { id: 'a', name: 'Novo', position: 0, kind: 'OPEN' as const },
      { id: 'b', name: 'Agendou', position: 1, kind: 'OPEN' as const },
      { id: 'c', name: 'Atendido', position: 2, kind: 'WON' as const },
      { id: 'x', name: 'Não seguiu', position: 3, kind: 'LOST' as const },
    ];
    const funnel = conversionFunnel(stages, [
      { reached: ['a'] },
      { reached: ['a', 'b'] },
      { reached: ['a', 'b', 'c'] },
      { reached: ['b', 'x'] },
    ]);
    expect(funnel.map((s) => [s.id, s.reached, s.percent])).toEqual([
      ['a', 4, 100],
      ['b', 3, 75],
      ['c', 1, 25],
    ]);
  });

  it('variação e metas', () => {
    expect(change(15, 10)).toBe(50);
    expect(change(5, 0)).toBeNull();
    expect(
      readPeriodGoals({
        doneCount: 40,
        periods: { week: { wonCount: 3, x: 1 }, month: { revenueCents: 900000 } },
      }),
    ).toEqual({
      week: { wonCount: 3 },
      month: { doneCount: 40, revenueCents: 900000 },
      quarter: {},
    });
  });
});
