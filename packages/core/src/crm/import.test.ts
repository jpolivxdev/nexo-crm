import { describe, expect, it } from 'vitest';
import { checkImport, normalizePhone, parseCsv } from './import.js';

describe('importar clientes', () => {
  it('lê ; ou , com aspas', () => {
    expect(parseCsv('\uFEFFnome;telefone\r\n"Ana; Souza";15 99999-0000\r\n')).toEqual([
      ['nome', 'telefone'],
      ['Ana; Souza', '15 99999-0000'],
    ]);
    expect(parseCsv('name,phone\n"Bia ""B""",11988887777\n\n')).toEqual([
      ['name', 'phone'],
      ['Bia "B"', '11988887777'],
    ]);
  });

  it('acerta o telefone', () => {
    expect(normalizePhone('(15) 99999-0000')).toBe('5515999990000');
    expect(normalizePhone('+55 15 3222-1111')).toBe('551532221111');
    expect(normalizePhone('123')).toBeNull();
  });

  it('marca nova, já cadastrada, repetida e inválida', () => {
    const csv = [
      'Telefone;Nome;Etiquetas',
      '15 99999-0000;Ana (demo);vip, cílios',
      '15 98888-0000;Bia (demo);',
      '(15) 99999-0000;Ana de novo;',
      'abc;Carla (demo);',
      '15 97777-0000;;',
    ].join('\n');
    const rows = checkImport(csv, new Set(['5515988880000']));
    expect(rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'new'],
      [3, 'existing'],
      [4, 'duplicate'],
      [5, 'invalid'],
      [6, 'invalid'],
    ]);
    expect(rows[0]).toMatchObject({ name: 'Ana (demo)', tags: ['vip', 'cílios'] });
  });

  it('sem cabeçalho: nome e telefone nas duas primeiras colunas', () => {
    expect(checkImport('Ana;15999990000', new Set())[0]).toMatchObject({
      line: 1,
      name: 'Ana',
      phone: '5515999990000',
      status: 'new',
    });
  });
});
