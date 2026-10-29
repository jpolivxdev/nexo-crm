import { describe, expect, it } from 'vitest';
import { availableSlots, dayRangeUtc, isOpenAt, isSlotAvailable, type SlotQuery } from './slots.js';

const TZ = 'America/Sao_Paulo';
// Terça, 03/11/2026. Expediente 9h-12h e 13h-18h (pausa de almoço).
const base: SlotQuery = {
  date: '2026-11-03',
  timeZone: TZ,
  durationMinutes: 60,
  availability: [
    { weekday: 2, startMinute: 540, endMinute: 720 },
    { weekday: 2, startMinute: 780, endMinute: 1080 },
  ],
  busy: [],
  now: new Date('2026-11-01T12:00:00Z'),
};

const localTimes = (q: SlotQuery) =>
  availableSlots(q).map((s) =>
    s.startsAt.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
  );

describe('availableSlots', () => {
  it('oferece horários de 30 em 30 minutos que cabem inteiros no expediente', () => {
    expect(localTimes(base)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
    ]);
  });

  it('não oferece horário que atravessa a pausa de almoço', () => {
    expect(localTimes(base)).not.toContain('11:30');
  });

  it('não oferece nada em dia sem expediente', () => {
    expect(availableSlots({ ...base, date: '2026-11-02' })).toEqual([]);
  });

  it('esconde horários que cruzam um horário já marcado', () => {
    const busy = [
      { startsAt: new Date('2026-11-03T13:00:00Z'), endsAt: new Date('2026-11-03T14:00:00Z') },
    ];
    // 10h-11h local ocupado: some 09:30, 10:00, 10:30.
    expect(localTimes({ ...base, busy })).toEqual([
      '09:00',
      '11:00',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
    ]);
  });

  it('respeita folga ou bloqueio do dia inteiro', () => {
    expect(availableSlots({ ...base, busy: [dayRangeUtc('2026-11-03', TZ)] })).toEqual([]);
  });

  it('respeita a antecedência mínima', () => {
    // Agora: 10h10 local. Com 60 min de antecedência, o primeiro horário é 11h30 -> não cabe antes do almoço.
    const now = new Date('2026-11-03T13:10:00Z');
    expect(localTimes({ ...base, now })[0]).toBe('13:00');
    expect(localTimes({ ...base, now, minNoticeMinutes: 0 })[0]).toBe('10:30');
  });

  it('usa o passo configurado e serviços longos', () => {
    expect(localTimes({ ...base, durationMinutes: 120, stepMinutes: 60 })).toEqual([
      '09:00',
      '10:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
  });

  it('recusa duração inválida', () => {
    expect(() => availableSlots({ ...base, durationMinutes: 0 })).toThrow();
  });
});

describe('isSlotAvailable', () => {
  it('aceita só horários exatamente oferecidos', () => {
    const ok = {
      startsAt: new Date('2026-11-03T12:00:00Z'),
      endsAt: new Date('2026-11-03T13:00:00Z'),
    };
    const fora = {
      startsAt: new Date('2026-11-03T12:10:00Z'),
      endsAt: new Date('2026-11-03T13:10:00Z'),
    };
    expect(isSlotAvailable(ok, base)).toBe(true);
    expect(isSlotAvailable(fora, base)).toBe(false);
  });
});

describe('horário de atendimento agora', () => {
  it('está aberto dentro da janela e fechado no almoço e fora do dia', () => {
    const at = (iso: string) => new Date(iso);
    expect(isOpenAt(base.availability, at('2026-11-03T12:00:00Z'), TZ)).toBe(true); // 9h
    expect(isOpenAt(base.availability, at('2026-11-03T15:30:00Z'), TZ)).toBe(false); // 12h30
    expect(isOpenAt(base.availability, at('2026-11-03T21:00:00Z'), TZ)).toBe(false); // 18h
    expect(isOpenAt(base.availability, at('2026-11-04T13:00:00Z'), TZ)).toBe(false); // quarta
  });
});
