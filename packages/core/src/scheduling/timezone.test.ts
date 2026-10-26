import { describe, expect, it } from 'vitest';
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from './timezone.js';

describe('fuso horário', () => {
  it('converte horário de São Paulo para UTC (UTC-3)', () => {
    expect(zonedToUtc('2026-11-03', 9 * 60, 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-03T12:00:00.000Z',
    );
  });

  it('respeita fusos de outros estados (Manaus, Noronha)', () => {
    expect(zonedToUtc('2026-11-03', 9 * 60, 'America/Manaus').toISOString()).toBe(
      '2026-11-03T13:00:00.000Z',
    );
    expect(zonedToUtc('2026-11-03', 9 * 60, 'America/Noronha').toISOString()).toBe(
      '2026-11-03T11:00:00.000Z',
    );
  });

  it('acerta dias de horário de verão (fuso com troca de horário)', () => {
    // Nova York: 08/03/2026 começa o horário de verão; 10h local = 14h UTC.
    expect(zonedToUtc('2026-03-08', 10 * 60, 'America/New_York').toISOString()).toBe(
      '2026-03-08T14:00:00.000Z',
    );
    expect(zonedToUtc('2026-03-07', 10 * 60, 'America/New_York').toISOString()).toBe(
      '2026-03-07T15:00:00.000Z',
    );
  });

  it('faz a volta de UTC para o horário local', () => {
    expect(utcToZoned(new Date('2026-11-03T02:30:00Z'), 'America/Sao_Paulo')).toEqual({
      date: '2026-11-02',
      weekday: 1,
      minute: 23 * 60 + 30,
    });
  });

  it('calcula dia da semana e soma dias atravessando mês e ano', () => {
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('recusa datas inválidas', () => {
    expect(() => weekdayOf('2026-02-30')).toThrow('Data inválida');
    expect(() => weekdayOf('03/11/2026')).toThrow('Data inválida');
  });
});
