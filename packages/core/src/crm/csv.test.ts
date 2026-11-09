import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

describe('planilha CSV', () => {
  it('escapa separador e aspas e neutraliza fórmulas', () => {
    expect(csvCell('Ana; Bia')).toBe('"Ana; Bia"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-10')).toBe("'-10");
    expect(csvCell(null)).toBe('');
    expect(csvCell(150)).toBe('150');
  });

  it('junta linhas com BOM e quebra do Windows', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, null],
      ]),
    ).toBe('﻿a;b\r\n1;\r\n');
  });
});
