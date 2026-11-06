import { utcToZoned } from '../scheduling/timezone.js';
import { DEFAULT_MESSAGES, type MessageOverrides, render } from './messages.js';
import { choices, type OutgoingMessage, type TemplateMessage } from './outgoing.js';

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

/**
 * Modelos que a dona cadastra na Meta para os lembretes fora da janela de 24 h. O texto é o
 * padrão do robô com as variáveis numeradas; a ordem de `vars` é a ordem de {{1}}, {{2}}...
 * O texto editado pela dona no painel não vale aqui: o modelo é o que a Meta aprovou.
 */
export const REMINDER_TEMPLATES = {
  BEFORE_24H: {
    name: 'lembrete_horario_24h',
    key: 'reminder24h',
    vars: ['negocio', 'servico', 'data', 'hora'],
    buttons: ['confirm', 'reschedule', 'cancel'],
  },
  BEFORE_1H: {
    name: 'lembrete_horario_1h',
    key: 'reminder1h',
    vars: ['servico', 'negocio', 'hora'],
    buttons: ['confirm', 'cancel'],
  },
} as const satisfies Record<
  ReminderKind,
  {
    name: string;
    key: 'reminder24h' | 'reminder1h';
    vars: readonly string[];
    buttons: readonly ('confirm' | 'reschedule' | 'cancel')[];
  }
>;

export const TEMPLATE_LANGUAGE = 'pt_BR';

const BUTTON_TITLE = {
  confirm: 'confirmYes',
  reschedule: 'manageReschedule',
  cancel: 'manageCancel',
} as const;

/** Texto para cadastrar na Meta, com {{1}}, {{2}}... no lugar das variáveis. */
export function templateSubmission(kind: ReminderKind): {
  name: string;
  body: string;
  buttons: string[];
} {
  const t = REMINDER_TEMPLATES[kind];
  const body = DEFAULT_MESSAGES[t.key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const i = (t.vars as readonly string[]).indexOf(name);
    return i >= 0 ? `{{${i + 1}}}` : match;
  });
  return { name: t.name, body, buttons: t.buttons.map((b) => DEFAULT_MESSAGES[BUTTON_TITLE[b]]) };
}

/**
 * A Meta recusa variável com quebra de linha, tabulação ou mais de 4 espaços seguidos.
 * Nome de serviço ou de negócio vem da dona, então limpa antes.
 */
const templateParam = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 200);

/** Lembrete como mensagem de modelo, com os mesmos botões do lembrete normal. */
export function reminderTemplate(
  kind: ReminderKind,
  appt: { id: string; serviceName: string; startsAt: Date },
  ctx: { businessName: string; timeZone: string },
): TemplateMessage {
  const t = REMINDER_TEMPLATES[kind];
  const vars: Record<string, string> = {
    negocio: templateParam(ctx.businessName),
    servico: templateParam(appt.serviceName),
    ...localWhen(appt.startsAt, ctx.timeZone),
  };
  return {
    type: 'template',
    body: render(t.key, vars),
    template: { name: t.name, language: TEMPLATE_LANGUAGE, params: t.vars.map((v) => vars[v]!) },
    buttons: t.buttons.map((b) => ({
      id: `rem:${b}:${appt.id}`,
      title: DEFAULT_MESSAGES[BUTTON_TITLE[b]],
    })),
  };
}
