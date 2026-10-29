import type { AppointmentStatus } from './types';

/** Textos e formatos da tela, sempre em pt-BR e no fuso do negócio. */

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Marcado',
  CONFIRMED: 'Confirmado',
  DONE: 'Realizado',
  NO_SHOW: 'Faltou',
  CANCELLED: 'Cancelado',
};

export function time(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

export function dayLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** "2031-01-07" → "terça, 07/01" sem depender do fuso do aparelho. */
export function localDateLabel(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function dateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** Data local (AAAA-MM-DD) de um instante no fuso. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(instant);
  return parts;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 5515999990000 → +55 (15) 99999-0000 */
export function phone(digits: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}

export function contactName(c: { name: string | null; phone: string }): string {
  return c.name?.trim() || phone(c.phone);
}

export const BUSINESS_TZ_FALLBACK = 'America/Sao_Paulo';

/** "2031-01-07" → "07/01". */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** O que aconteceu, em pt-BR, completando o nome da cliente ("Ana marcou um horário"). */
export function activityText(type: string, actorType: string): string {
  const byClient = actorType === 'contact';
  switch (type) {
    case 'contact.created':
      return byClient ? 'mandou a primeira mensagem' : 'foi cadastrada no painel';
    case 'appointment.created':
      return byClient ? 'marcou um horário pelo WhatsApp' : 'teve um horário marcado no painel';
    case 'appointment.rescheduled':
      return byClient ? 'remarcou o horário' : 'teve o horário remarcado';
    case 'appointment.confirmed':
      return byClient ? 'confirmou o horário pelo lembrete' : 'teve o horário confirmado';
    case 'appointment.cancelled':
      return byClient ? 'cancelou o horário' : 'teve o horário cancelado';
    case 'appointment.done':
      return 'foi atendida';
    case 'appointment.no_show':
      return 'faltou ao horário';
    case 'handoff.requested':
      return 'pediu para falar com você';
    case 'contact.opted_out':
      return 'pediu para não receber mensagens automáticas';
    default:
      return 'teve uma atualização';
  }
}
