import { describe, expect, it } from 'vitest';
import { forecast } from './forecast.js';

describe('previsão do CRM', () => {
  it('soma o em aberto, pesa pela chance da etapa e separa por mês', () => {
    const result = forecast([
      { valueCents: 10000, probability: 50, stageKind: 'OPEN', expectedCloseOn: '2026-12-10' },
      { valueCents: 20000, probability: 25, stageKind: 'OPEN', expectedCloseOn: '2026-11-30' },
      { valueCents: 5000, probability: null, stageKind: 'OPEN', expectedCloseOn: null },
      { valueCents: 99999, probability: 100, stageKind: 'LOST', expectedCloseOn: null },
      { valueCents: null, probability: 80, stageKind: 'OPEN', expectedCloseOn: '2026-12-01' },
    ]);
    expect(result).toEqual({
      count: 4,
      openCents: 35000,
      weightedCents: 10000,
      byMonth: [
        { month: '2026-11', count: 1, openCents: 20000, weightedCents: 5000 },
        { month: '2026-12', count: 2, openCents: 10000, weightedCents: 5000 },
        { month: null, count: 1, openCents: 5000, weightedCents: 0 },
      ],
    });
  });

  it('chance fora de 0 a 100 é limitada', () => {
    const r = forecast([
      { valueCents: 1000, probability: 150, stageKind: 'OPEN', expectedCloseOn: null },
      { valueCents: 1000, probability: -5, stageKind: 'OPEN', expectedCloseOn: null },
    ]);
    expect(r.weightedCents).toBe(1000);
  });
});
