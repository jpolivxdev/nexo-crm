import { addDays, type LocalDate, utcToZoned, weekdayOf, zonedToUtc } from './timezone.js';

/** Janela de trabalho semanal (minutos desde 00:00 no fuso do negócio). */
export interface WeeklyWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Intervalo ocupado em UTC: horário marcado, folga ou bloqueio. */
export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotQuery {
  /** Dia, no fuso do negócio. */
  date: LocalDate;
  timeZone: string;
  durationMinutes: number;
  availability: readonly WeeklyWindow[];
  /** Horários marcados, folgas e bloqueios que podem cruzar o dia. */
  busy: readonly BusyInterval[];
  now: Date;
  /** De quanto em quanto tempo oferecer horários. Padrão: 30 minutos. */
  stepMinutes?: number;
  /** Antecedência mínima para marcar. Padrão: 60 minutos. */
  minNoticeMinutes?: number;
}

export const DEFAULT_STEP_MINUTES = 30;
export const DEFAULT_MIN_NOTICE_MINUTES = 60;

function overlaps(a: BusyInterval, b: BusyInterval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Horários livres de uma profissional num dia.
 * Um horário só entra se couber inteiro numa janela de trabalho, não cruzar nada ocupado
 * e respeitar a antecedência mínima. Os horários começam alinhados ao início de cada janela.
 */
export function availableSlots(query: SlotQuery): Slot[] {
  const step = query.stepMinutes ?? DEFAULT_STEP_MINUTES;
  const notice = query.minNoticeMinutes ?? DEFAULT_MIN_NOTICE_MINUTES;
  if (query.durationMinutes <= 0) throw new Error('Duração do serviço precisa ser positiva.');
  if (step <= 0) throw new Error('Intervalo entre horários precisa ser positivo.');

  const earliest = query.now.getTime() + notice * 60_000;
  const weekday = weekdayOf(query.date);
  const windows = query.availability
    .filter((w) => w.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);

  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (const window of windows) {
    for (
      let start = window.startMinute;
      start + query.durationMinutes <= window.endMinute;
      start += step
    ) {
      const slot = {
        startsAt: zonedToUtc(query.date, start, query.timeZone),
        endsAt: zonedToUtc(query.date, start + query.durationMinutes, query.timeZone),
      };
      const t = slot.startsAt.getTime();
      if (t < earliest || seen.has(t)) continue;
      if (query.busy.some((b) => overlaps(slot, b))) continue;
      seen.add(t);
      slots.push(slot);
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Intervalo UTC que cobre o dia local inteiro (para buscar o que está ocupado). */
export function dayRangeUtc(date: LocalDate, timeZone: string): BusyInterval {
  return {
    startsAt: zonedToUtc(date, 0, timeZone),
    endsAt: zonedToUtc(addDays(date, 1), 0, timeZone),
  };
}

/** Diz se um horário pedido é um dos horários livres (mesmo início e fim). */
export function isSlotAvailable(slot: Slot, query: SlotQuery): boolean {
  return availableSlots(query).some(
    (s) =>
      s.startsAt.getTime() === slot.startsAt.getTime() &&
      s.endsAt.getTime() === slot.endsAt.getTime(),
  );
}

/** Data local de hoje no fuso do negócio. */
export function todayIn(timeZone: string, now: Date): LocalDate {
  return utcToZoned(now, timeZone).date;
}

/** Se o negócio está no horário de atendimento nesse instante (alguma janela cobre agora). */
export function isOpenAt(
  availability: readonly WeeklyWindow[],
  instant: Date,
  timeZone: string,
): boolean {
  const { weekday, minute } = utcToZoned(instant, timeZone);
  return availability.some(
    (w) => w.weekday === weekday && w.startMinute <= minute && minute < w.endMinute,
  );
}
