import { utcToZoned } from '../scheduling/timezone.js';
import { type MessageOverrides, render } from './messages.js';
import { choices, type OutgoingMessage } from './outgoing.js';

/** Lembretes de horário: quando mandar e o que dizer. Sem banco e sem relógio próprio. */

export type ReminderKind = 'BEFORE_24H' | 'BEFORE_1H';

const OFFSET_MS: Record<ReminderKind, number> = {
  BEFORE_24H: 24 * 60 * 60 * 1000,
  BEFORE_1H: 60 * 60 * 1000,
};

/** Não manda lembrete atrasado: quem marcou em cima da hora já sabe do horário. */
export const REMINDER_LATE_TOLERANCE_MS = 30 * 60 * 1000;

/** Lembretes que ainda fazem sentido para um horário marcado agora (`now`). */
export function planReminders(startsAt: Date, now: Date): { kind: ReminderKind; sendAt: Date }[] {
  return (Object.keys(OFFSET_MS) as ReminderKind[])
    .map((kind) => ({ kind, sendAt: new Date(startsAt.getTime() - OFFSET_MS[kind]) }))
    .filter((r) => r.sendAt.getTime() > now.getTime());
}

/** Na hora de enviar: ainda vale? (o horário não passou e o envio não atrasou demais) */
export function reminderStillUseful(sendAt: Date, startsAt: Date, now: Date): boolean {
  return (
    startsAt.getTime() > now.getTime() &&
    now.getTime() - sendAt.getTime() <= REMINDER_LATE_TOLERANCE_MS
  );
}

const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Data e hora no fuso do negócio, do jeito que se fala: { data: "quinta, 15/01", hora: "09:00" }. */
export function localWhen(at: Date, timeZone: string): { data: string; hora: string } {
  const { date, minute } = utcToZoned(at, timeZone);
  const [, m, d] = date.split('-');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return {
    data: `${WEEKDAYS_LONG[weekday]}, ${d}/${m}`,
    hora: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
  };
}

/** Mensagem do lembrete com até 3 botões (Confirmar, Remarcar, Cancelar). */
export function reminderMessage(
  kind: ReminderKind,
  appt: { id: string; serviceName: string; startsAt: Date },
  ctx: { businessName: string; ownerName: string; timeZone: string; messages?: MessageOverrides },
): OutgoingMessage {
  const vars = {
    negocio: ctx.businessName,
    dona: ctx.ownerName,
    servico: appt.serviceName,
    ...localWhen(appt.startsAt, ctx.timeZone),
  };
  const t = (key: Parameters<typeof render>[0]) => render(key, vars, ctx.messages);
  const options =
    kind === 'BEFORE_24H'
      ? [
          { id: `rem:confirm:${appt.id}`, title: t('confirmYes') },
          { id: `rem:reschedule:${appt.id}`, title: t('manageReschedule') },
          { id: `rem:cancel:${appt.id}`, title: t('manageCancel') },
        ]
      : [
          { id: `rem:confirm:${appt.id}`, title: t('confirmYes') },
          { id: `rem:cancel:${appt.id}`, title: t('manageCancel') },
        ];
  return choices(t(kind === 'BEFORE_24H' ? 'reminder24h' : 'reminder1h'), options);
}
