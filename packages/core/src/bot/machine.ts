import { type LocalDate, utcToZoned } from '../scheduling/timezone.js';
import { type MessageKey, type MessageOverrides, render } from './messages.js';
import { type Choice, choices, LIMITS, type OutgoingMessage, text } from './outgoing.js';
import { globalCommand } from './text.js';

/**
 * Robô de atendimento como máquina de estados explícita.
 * Não sabe nada de banco nem da Meta: recebe o estado salvo, a mensagem e as "portas"
 * (funções que consultam agenda e marcam horários) e devolve o novo estado, as respostas
 * e as ações que quem chamou precisa executar (registrar consentimento, passar para a equipe).
 */

export type BotStep =
  | 'start'
  | 'menu'
  | 'service'
  | 'professional'
  | 'date'
  | 'time'
  | 'confirm'
  | 'mine'
  | 'manage'
  | 'cancel_confirm'
  | 'faq'
  | 'handoff'
  | 'opted_out';

export interface BotState {
  step: BotStep;
  flow?: 'book' | 'reschedule';
  serviceId?: string;
  /** Ausente = qualquer profissional. */
  professionalId?: string;
  date?: LocalDate;
  /** Início escolhido, em ISO (UTC). */
  startsAt?: string;
  appointmentId?: string;
  page?: number;
}

/** Texto digitado, ou toque num botão/linha de lista (id da opção). */
export type BotInput = { kind: 'text'; text: string } | { kind: 'choice'; id: string };

export interface FaqItem {
  question: string;
  answer: string;
}

export interface BotContext {
  businessName: string;
  /** Nome de quem atende (aparece em "Falar com ..."). */
  ownerName: string;
  timeZone: string;
  now: Date;
  /** Primeira mensagem dessa pessoa: mostra o aviso de privacidade. */
  isFirstContact: boolean;
  /** Se a equipe está no horário de atendimento agora. */
  ownerAvailableNow: boolean;
  messages?: MessageOverrides;
  faq?: FaqItem[];
  /** Quantos dias à frente procurar horários. Padrão: 14. */
  daysAhead?: number;
}

export interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface ProfessionalOption {
  id: string;
  name: string;
}

export interface AppointmentSummary {
  id: string;
  serviceId: string;
  serviceName: string;
  startsAt: Date;
}

export type BookResult = { ok: true } | { ok: false; reason: 'slot_taken' };

export interface BotPorts {
  listServices(): Promise<ServiceOption[]>;
  listProfessionals(serviceId: string): Promise<ProfessionalOption[]>;
  /** Dias (a partir de `from`) que têm pelo menos um horário livre. */
  listDates(q: {
    serviceId: string;
    professionalId?: string;
    from: LocalDate;
    days: number;
    ignoreAppointmentId?: string;
  }): Promise<LocalDate[]>;
  listSlots(q: {
    serviceId: string;
    professionalId?: string;
    date: LocalDate;
    ignoreAppointmentId?: string;
  }): Promise<Date[]>;
  book(q: { serviceId: string; professionalId?: string; startsAt: Date }): Promise<BookResult>;
  /** Próximos horários ativos desta pessoa. */
  upcoming(): Promise<AppointmentSummary[]>;
  reschedule(q: { appointmentId: string; startsAt: Date }): Promise<BookResult>;
  cancel(appointmentId: string): Promise<void>;
  /** A cliente confirmou pelo lembrete. */
  confirm(appointmentId: string): Promise<void>;
}

export type BotAction =
  | { type: 'privacy_notice_shown' }
  | { type: 'opt_out' }
  | { type: 'opt_in' }
  | { type: 'handoff' }
  | { type: 'faq_viewed' };

export interface BotResult {
  state: BotState;
  replies: OutgoingMessage[];
  actions: BotAction[];
}

const PAGE_SIZE = LIMITS.listRows - 1; // uma linha fica para "Ver mais"

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

class Turn {
  readonly replies: OutgoingMessage[] = [];
  readonly actions: BotAction[] = [];
  state: BotState;

  constructor(
    state: BotState,
    readonly ctx: BotContext,
    readonly ports: BotPorts,
  ) {
    this.state = state;
  }

  t(key: MessageKey, vars: Record<string, string> = {}): string {
    return render(
      key,
      { negocio: this.ctx.businessName, dona: this.ctx.ownerName, ...vars },
      this.ctx.messages,
    );
  }

  say(body: string) {
    this.replies.push(text(body));
  }

  ask(body: string, options: Choice[], listButton?: string) {
    this.replies.push(choices(body, options, listButton));
  }

  go(state: BotState) {
    this.state = state;
  }

  // ---------- formatação ----------

  dayLabel(date: LocalDate, long = false): string {
    const [, m, d] = date.split('-');
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return `${(long ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[weekday]}, ${d}/${m}`;
  }

  timeLabel(instant: Date): string {
    const { minute } = utcToZoned(instant, this.ctx.timeZone);
    return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  }

  localDate(instant: Date): LocalDate {
    return utcToZoned(instant, this.ctx.timeZone).date;
  }

  today(): LocalDate {
    return this.localDate(this.ctx.now);
  }

  page<T>(items: T[], page = 0): { items: T[]; more: boolean } {
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);
    const more = items.length > start + PAGE_SIZE;
    // Se só sobrar um item, ele cabe no lugar do "Ver mais".
    if (more && items.length === start + PAGE_SIZE + 1) {
      return { items: items.slice(start, start + PAGE_SIZE + 1), more: false };
    }
    return { items: slice, more };
  }

  moreRow(page: number): Choice {
    return { id: `more:${page + 1}`, title: this.t('more') };
  }

  result(): BotResult {
    return { state: this.state, replies: this.replies, actions: this.actions };
  }
}

// ---------- telas (cada uma pergunta algo e muda o passo) ----------

async function showMenu(turn: Turn) {
  const options: Choice[] = [
    { id: 'menu:book', title: turn.t('menuBook') },
    { id: 'menu:mine', title: turn.t('menuMine') },
  ];
  if (turn.ctx.faq?.length) options.push({ id: 'menu:faq', title: turn.t('menuFaq') });
  options.push({ id: 'menu:human', title: turn.t('menuHuman') });
  turn.ask(turn.t('menu'), options);
  turn.go({ step: 'menu' });
}

async function askService(turn: Turn, page = 0) {
  const services = await turn.ports.listServices();
  if (services.length === 0) {
    turn.ask(turn.t('noServices'), [{ id: 'menu:human', title: turn.t('menuHuman') }]);
    turn.go({ step: 'menu' });
    return;
  }
  if (services.length === 1) {
    await chooseService(turn, services[0]!);
    return;
  }
  const { items, more } = turn.page(services, page);
  const options = items.map((s) => ({ id: `svc:${s.id}`, title: s.name }));
  if (more) options.push(turn.moreRow(page));
  turn.ask(turn.t('chooseService'), options, 'Ver serviços');
  turn.go({ step: 'service', flow: 'book', page });
}

async function chooseService(turn: Turn, service: ServiceOption) {
  const professionals = await turn.ports.listProfessionals(service.id);
  if (professionals.length > 1) {
    const options = [
      { id: 'pro:any', title: turn.t('anyProfessional') },
      ...professionals
        .slice(0, LIMITS.listRows - 1)
        .map((p) => ({ id: `pro:${p.id}`, title: p.name })),
    ];
    turn.ask(turn.t('chooseProfessional'), options, 'Ver profissionais');
    turn.go({ step: 'professional', flow: 'book', serviceId: service.id });
    return;
  }
  await askDate(turn, { step: 'date', flow: 'book', serviceId: service.id });
}

async function serviceName(turn: Turn, serviceId: string): Promise<string> {
  const services = await turn.ports.listServices();
  return services.find((s) => s.id === serviceId)?.name ?? '';
}

async function askDate(turn: Turn, base: BotState, page = 0) {
  const dates = await turn.ports.listDates({
    serviceId: base.serviceId!,
    professionalId: base.professionalId,
    from: turn.today(),
    days: turn.ctx.daysAhead ?? 14,
    ignoreAppointmentId: base.flow === 'reschedule' ? base.appointmentId : undefined,
  });
  if (dates.length === 0) {
    turn.ask(turn.t('noDates'), [
      { id: 'menu:human', title: turn.t('menuHuman') },
      { id: 'menu:back', title: turn.t('manageBack') },
    ]);
    turn.go({ step: 'menu' });
    return;
  }
  const { items, more } = turn.page(dates, page);
  const options = items.map((d) => ({ id: `date:${d}`, title: turn.dayLabel(d) }));
  if (more) options.push(turn.moreRow(page));
  turn.ask(
    turn.t('chooseDate', { servico: await serviceName(turn, base.serviceId!) }),
    options,
    'Ver dias',
  );
  turn.go({ ...base, step: 'date', date: undefined, startsAt: undefined, page });
}

async function askTime(turn: Turn, base: BotState, page = 0) {
  const slots = await turn.ports.listSlots({
    serviceId: base.serviceId!,
    professionalId: base.professionalId,
    date: base.date!,
    ignoreAppointmentId: base.flow === 'reschedule' ? base.appointmentId : undefined,
  });
  if (slots.length === 0) {
    turn.say(turn.t('noTimes'));
    await askDate(turn, base);
    return;
  }
  const { items, more } = turn.page(slots, page);
  const options = items.map((s) => ({ id: `time:${s.toISOString()}`, title: turn.timeLabel(s) }));
  if (more) options.push(turn.moreRow(page));
  turn.ask(
    turn.t('chooseTime', { data: turn.dayLabel(base.date!, true) }),
    options,
    'Ver horários',
  );
  turn.go({ ...base, step: 'time', startsAt: undefined, page });
}

async function askConfirm(turn: Turn, base: BotState) {
  const startsAt = new Date(base.startsAt!);
  turn.ask(
    turn.t('confirm', {
      servico: await serviceName(turn, base.serviceId!),
      data: turn.dayLabel(base.date!, true),
      hora: turn.timeLabel(startsAt),
    }),
    [
      { id: 'confirm:yes', title: turn.t('confirmYes') },
      { id: 'confirm:other', title: turn.t('confirmOtherTime') },
    ],
  );
  turn.go({ ...base, step: 'confirm' });
}

async function showMine(turn: Turn) {
  const upcoming = await turn.ports.upcoming();
  if (upcoming.length === 0) {
    turn.ask(turn.t('mineEmpty'), [
      { id: 'menu:book', title: turn.t('menuBook') },
      { id: 'menu:back', title: turn.t('manageBack') },
    ]);
    turn.go({ step: 'menu' });
    return;
  }
  const options = upcoming.slice(0, LIMITS.listRows).map((a) => ({
    id: `appt:${a.id}`,
    title: `${turn.dayLabel(turn.localDate(a.startsAt))} ${turn.timeLabel(a.startsAt)}`,
    description: a.serviceName,
  }));
  turn.ask(turn.t('mineList'), options, 'Ver horários');
  turn.go({ step: 'mine' });
}

function apptVars(turn: Turn, a: AppointmentSummary) {
  return {
    servico: a.serviceName,
    data: turn.dayLabel(turn.localDate(a.startsAt), true),
    hora: turn.timeLabel(a.startsAt),
  };
}

async function findUpcoming(turn: Turn, id: string | undefined) {
  if (!id) return undefined;
  return (await turn.ports.upcoming()).find((a) => a.id === id);
}

async function showFaq(turn: Turn) {
  const faq = turn.ctx.faq ?? [];
  if (faq.length === 0) {
    turn.ask(turn.t('faqEmpty'), [
      { id: 'menu:human', title: turn.t('menuHuman') },
      { id: 'menu:back', title: turn.t('manageBack') },
    ]);
    turn.go({ step: 'menu' });
    return;
  }
  turn.ask(
    turn.t('faqList'),
    faq.slice(0, LIMITS.listRows).map((f, i) => ({ id: `faq:${i}`, title: f.question })),
    'Ver dúvidas',
  );
  turn.go({ step: 'faq' });
}

function handoff(turn: Turn) {
  turn.say(turn.t(turn.ctx.ownerAvailableNow ? 'handoff' : 'handoffClosed'));
  turn.actions.push({ type: 'handoff' });
  turn.go({ step: 'handoff' });
}

/** Repete a pergunta do passo atual (depois de uma resposta que não entendemos). */
async function reask(turn: Turn) {
  const s = turn.state;
  switch (s.step) {
    case 'service':
      return askService(turn, s.page);
    case 'professional': {
      const service = (await turn.ports.listServices()).find((x) => x.id === s.serviceId);
      return service ? chooseService(turn, service) : askService(turn);
    }
    case 'date':
      return askDate(turn, s, s.page);
    case 'time':
      return askTime(turn, s, s.page);
    case 'confirm':
      return askConfirm(turn, s);
    case 'mine':
      return showMine(turn);
    case 'faq':
      return showFaq(turn);
    case 'manage':
    case 'cancel_confirm': {
      const appt = await findUpcoming(turn, s.appointmentId);
      return appt ? manage(turn, appt) : showMine(turn);
    }
    default:
      return showMenu(turn);
  }
}

function manage(turn: Turn, appt: AppointmentSummary) {
  turn.ask(turn.t('manage', apptVars(turn, appt)), [
    { id: 'manage:reschedule', title: turn.t('manageReschedule') },
    { id: 'manage:cancel', title: turn.t('manageCancel') },
    { id: 'manage:back', title: turn.t('manageBack') },
  ]);
  turn.go({ step: 'manage', appointmentId: appt.id });
}

// ---------- respostas por passo ----------

async function onChoice(turn: Turn, id: string): Promise<boolean> {
  const [kind, value = ''] = splitId(id);
  const s = turn.state;

  // Opções do menu valem de qualquer tela que as mostre (menu, "sem horários", "sem serviços").
  if (kind === 'menu') {
    if (value === 'book') await askService(turn);
    else if (value === 'mine') await showMine(turn);
    else if (value === 'faq') await showFaq(turn);
    else if (value === 'human') handoff(turn);
    else await showMenu(turn);
    return true;
  }

  // Botões do lembrete (rem:confirm:<id>, rem:reschedule:<id>, rem:cancel:<id>) valem em qualquer passo.
  if (kind === 'rem') return onReminderChoice(turn, value);

  if (kind === 'more' && ['service', 'date', 'time'].includes(s.step)) {
    const page = Number(value);
    if (!Number.isInteger(page) || page < 0) return false;
    if (s.step === 'service') await askService(turn, page);
    if (s.step === 'date') await askDate(turn, s, page);
    if (s.step === 'time') await askTime(turn, s, page);
    return true;
  }

  switch (s.step) {
    case 'service': {
      if (kind !== 'svc') return false;
      const service = (await turn.ports.listServices()).find((x) => x.id === value);
      if (!service) return false;
      await chooseService(turn, service);
      return true;
    }
    case 'professional': {
      if (kind !== 'pro') return false;
      if (value !== 'any') {
        const pros = await turn.ports.listProfessionals(s.serviceId!);
        if (!pros.some((p) => p.id === value)) return false;
      }
      await askDate(turn, {
        step: 'date',
        flow: 'book',
        serviceId: s.serviceId,
        professionalId: value === 'any' ? undefined : value,
      });
      return true;
    }
    case 'date': {
      if (kind !== 'date' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      await askTime(turn, { ...s, date: value });
      return true;
    }
    case 'time': {
      if (kind !== 'time') return false;
      const startsAt = new Date(value);
      if (Number.isNaN(startsAt.getTime())) return false;
      await askConfirm(turn, { ...s, startsAt: startsAt.toISOString() });
      return true;
    }
    case 'confirm': {
      if (kind !== 'confirm') return false;
      if (value === 'other') {
        await askDate(turn, s);
        return true;
      }
      if (value !== 'yes') return false;
      return confirmBooking(turn, s);
    }
    case 'mine': {
      if (kind !== 'appt') return false;
      const appt = await findUpcoming(turn, value);
      if (!appt) return false;
      manage(turn, appt);
      return true;
    }
    case 'manage': {
      if (kind !== 'manage') return false;
      const appt = await findUpcoming(turn, s.appointmentId);
      if (!appt || value === 'back') {
        await showMine(turn);
        return true;
      }
      if (value === 'reschedule') {
        await askDate(turn, {
          step: 'date',
          flow: 'reschedule',
          serviceId: appt.serviceId,
          appointmentId: appt.id,
        });
        return true;
      }
      if (value === 'cancel') {
        turn.ask(turn.t('cancelConfirm', apptVars(turn, appt)), [
          { id: 'cancel:yes', title: turn.t('cancelYes') },
          { id: 'cancel:no', title: turn.t('cancelNo') },
        ]);
        turn.go({ step: 'cancel_confirm', appointmentId: appt.id });
        return true;
      }
      return false;
    }
    case 'cancel_confirm': {
      if (kind !== 'cancel') return false;
      if (value === 'yes' && s.appointmentId) {
        await turn.ports.cancel(s.appointmentId);
        turn.say(turn.t('cancelled'));
        turn.go({ step: 'start' });
      } else {
        await showMenu(turn);
      }
      return true;
    }
    case 'faq': {
      if (kind !== 'faq') return false;
      const item = turn.ctx.faq?.[Number(value)];
      if (!item) return false;
      turn.say(item.answer);
      turn.actions.push({ type: 'faq_viewed' });
      await showMenu(turn);
      return true;
    }
    default:
      return false;
  }
}

async function onReminderChoice(turn: Turn, value: string): Promise<boolean> {
  const [action, appointmentId] = splitId(value);
  if (!['confirm', 'reschedule', 'cancel'].includes(action)) return false;
  // Só horários ativos desta cliente: o id veio de fora.
  const appt = await findUpcoming(turn, appointmentId);
  if (!appt) {
    turn.say(turn.t('reminderGone'));
    turn.go({ step: 'start' });
    return true;
  }
  if (action === 'confirm') {
    await turn.ports.confirm(appt.id);
    const vars = apptVars(turn, appt);
    turn.say(turn.t('reminderConfirmed', vars));
    turn.go({ step: 'start' });
    return true;
  }
  if (action === 'reschedule') {
    await askDate(turn, {
      step: 'date',
      flow: 'reschedule',
      serviceId: appt.serviceId,
      appointmentId: appt.id,
    });
    return true;
  }
  turn.ask(turn.t('cancelConfirm', apptVars(turn, appt)), [
    { id: 'cancel:yes', title: turn.t('cancelYes') },
    { id: 'cancel:no', title: turn.t('cancelNo') },
  ]);
  turn.go({ step: 'cancel_confirm', appointmentId: appt.id });
  return true;
}

async function confirmBooking(turn: Turn, s: BotState): Promise<boolean> {
  const startsAt = new Date(s.startsAt!);
  const result =
    s.flow === 'reschedule'
      ? await turn.ports.reschedule({ appointmentId: s.appointmentId!, startsAt })
      : await turn.ports.book({
          serviceId: s.serviceId!,
          professionalId: s.professionalId,
          startsAt,
        });

  if (!result.ok) {
    turn.say(turn.t('slotTaken'));
    await askTime(turn, s);
    return true;
  }
  const vars = {
    servico: await serviceName(turn, s.serviceId!),
    data: turn.dayLabel(s.date!, true),
    hora: turn.timeLabel(startsAt),
  };
  turn.say(turn.t(s.flow === 'reschedule' ? 'rescheduled' : 'booked', vars));
  turn.go({ step: 'start' });
  return true;
}

function splitId(id: string): [string, string] {
  const i = id.indexOf(':');
  return i === -1 ? [id, ''] : [id.slice(0, i), id.slice(i + 1)];
}

/** Processa uma mensagem recebida. */
export async function handle(
  saved: BotState | null | undefined,
  input: BotInput,
  ctx: BotContext,
  ports: BotPorts,
): Promise<BotResult> {
  const turn = new Turn(saved?.step ? saved : { step: 'start' }, ctx, ports);

  // Quem pediu para parar só volta a receber mensagens se escrever "oi"/"menu".
  if (turn.state.step === 'opted_out') {
    if (input.kind === 'text' && globalCommand(input.text) === 'menu') {
      turn.actions.push({ type: 'opt_in' });
      await showMenu(turn);
    }
    return turn.result();
  }

  if (input.kind === 'text') {
    const command = globalCommand(input.text);
    if (command === 'opt_out') {
      turn.say(turn.t('optOut'));
      turn.actions.push({ type: 'opt_out' });
      turn.go({ step: 'opted_out' });
      return turn.result();
    }
  }

  if (ctx.isFirstContact) {
    turn.say(turn.t('privacyNotice'));
    turn.actions.push({ type: 'privacy_notice_shown' });
  }

  if (input.kind === 'text') {
    const command = globalCommand(input.text);
    if (command === 'menu') await showMenu(turn);
    else if (command === 'cancel') await showMine(turn);
    else if (command === 'human') handoff(turn);
    else if (turn.state.step === 'start' || turn.state.step === 'handoff') await showMenu(turn);
    else {
      // Texto livre sem IA na Fase 1: avisa e repete a pergunta, com a opção de falar com a equipe no menu.
      turn.say(turn.t('notUnderstood'));
      await reask(turn);
    }
    return turn.result();
  }

  const handled = await onChoice(turn, input.id);
  if (!handled) {
    turn.say(turn.t('notUnderstood'));
    await reask(turn);
  }
  return turn.result();
}
