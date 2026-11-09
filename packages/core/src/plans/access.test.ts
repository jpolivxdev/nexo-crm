import { describe, expect, it } from 'vitest';
import { accessRulesOf, areasFor, DEFAULT_ACCESS } from './access.js';

describe('acessos por papel', () => {
  it('sem regra salva, vale o padrão; dono vê tudo', () => {
    const rules = accessRulesOf({});
    expect(rules).toEqual(DEFAULT_ACCESS);
    expect(areasFor('OWNER', rules)).toEqual(['reports', 'settings', 'privacy']);
    expect(areasFor('MANAGER', rules)).toEqual(['reports', 'settings', 'privacy']);
    expect(areasFor('CONSULTANT', rules)).toEqual(['reports']);
    expect(areasFor('STAFF', rules)).toEqual([]);
  });

  it('o dono liga e desliga por papel; valor estranho é ignorado', () => {
    const rules = accessRulesOf({
      CONSULTANT: { reports: false, settings: true, privacy: 'sim' },
      OUTRO: { reports: true },
    });
    expect(areasFor('CONSULTANT', rules)).toEqual(['settings']);
    expect(areasFor('NEXO_ADMIN', rules)).toEqual([]);
  });
});
