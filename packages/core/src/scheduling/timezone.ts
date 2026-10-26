/**
 * Conversões de fuso sem dependências, usando a base de fusos do próprio Node (Intl).
 * Regra do projeto: tudo é guardado em UTC e exibido no fuso do negócio.
 */

/** Data local no formato AAAA-MM-DD. */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  date: LocalDate;
  /** 0 = domingo ... 6 = sábado. */
  weekday: number;
  /** Minutos desde 00:00 no fuso. */
  minute: number;
}

function rawParts(instant: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Diferença (em minutos) entre o horário local do fuso e o UTC naquele instante. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = rawParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Data inválida: ${date}`);
  }
  return { year, month, day };
}

/** Dia da semana de uma data local (0 = domingo). */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Soma dias a uma data local. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Instante UTC de "data local + minutos desde 00:00" no fuso. */
export function zonedToUtc(date: LocalDate, minute: number, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const guess = Date.UTC(year, month - 1, day, 0, minute);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  // Segunda passada corrige dias de troca de horário de verão.
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** Data, dia da semana e minuto local de um instante no fuso. */
export function utcToZoned(instant: Date, timeZone: string): ZonedParts {
  const p = rawParts(instant, timeZone);
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return { date, weekday: weekdayOf(date), minute: p.hour * 60 + p.minute };
}
