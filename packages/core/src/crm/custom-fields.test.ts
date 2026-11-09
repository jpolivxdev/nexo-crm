import { describe, expect, it } from 'vitest';
import { checkFieldValues, type CustomFieldDef } from './custom-fields.js';

const DEFS: CustomFieldDef[] = [
  { id: 'a', label: 'Indicada por', type: 'text', options: [] },
  { id: 'b', label: 'Sessões', type: 'number', options: [] },
  { id: 'c', label: 'Evento', type: 'date', options: [] },
  { id: 'd', label: 'Tipo', type: 'select', options: ['Noiva', 'Formatura'] },
];

describe('campos próprios', () => {
  it('limpa e aceita valores válidos; vazio apaga', () => {
    expect(checkFieldValues(DEFS, { a: '  Bia ', b: '3,5', c: '2026-12-20', d: 'Noiva' })).toEqual({
      ok: true,
      values: { a: 'Bia', b: 3.5, c: '2026-12-20', d: 'Noiva' },
    });
    expect(checkFieldValues(DEFS, { a: '', b: null })).toEqual({
      ok: true,
      values: { a: null, b: null },
    });
  });

  it('recusa campo que não existe e valor fora do tipo', () => {
    expect(checkFieldValues(DEFS, { z: 'x' }).ok).toBe(false);
    expect(checkFieldValues(DEFS, { b: 'muitas' })).toEqual({
      ok: false,
      message: 'Sessões: use um número.',
    });
    expect(checkFieldValues(DEFS, { c: '20/12/2026' }).ok).toBe(false);
    expect(checkFieldValues(DEFS, { d: 'Outro' }).ok).toBe(false);
    expect(checkFieldValues(DEFS, { a: 'x'.repeat(201) }).ok).toBe(false);
  });
});
