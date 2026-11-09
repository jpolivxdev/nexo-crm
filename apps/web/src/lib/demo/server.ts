import { ApiError } from '../api';
import type { AppointmentStatus } from '../types';
import {
  addDays,
  botMessages,
  createDemoStore,
  type DemoAppointment,
  type DemoStore,
  localAt,
  localDate,
  TZ,
  weekday,
} from './data';
import { leaveDemo } from './mode';

/**
 * "Servidor" da demonstração: responde às mesmas rotas da API, só na memória do navegador.
 * Recarregar a página recomeça do zero. Nada sai daqui: nem WhatsApp, nem e-mail, nem IA.
 */

let store: DemoStore | null = null;

function db(): DemoStore {
  store ??= createDemoStore();
  return store;
}

/** Recomeça a demo (usado nos testes e ao sair). */
export function resetDemo(now?: Date): void {
  store = now ? createDemoStore(now) : null;
}

const NOT_HERE = 'Isto não está disponível na demonstração.';
const DAY = 86_400_000;

function fail(status: number, message: string): never {
  throw new ApiError(status, message, { message });
}

function newId(prefix: string): string {
  const s = db();
  s.seq += 1;
  return `demo-${prefix}-n${s.seq.toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function contactRef(id: string) {
  const c = db().contacts.find((x) => x.id === id);
  if (!c) fail(404, 'Cliente não encontrada.');
  return { id: c.id, name: c.name, phone: c.phone };
}

function service(id: string) {
  const s = db().services.find((x) => x.id === id);
  if (!s) fail(404, 'Serviço não encontrado.');
  return s;
}

function professional(id: string) {
  const p = db().professionals.find((x) => x.id === id) ?? db().professionals[0]!;
  return { id: p.id, name: p.name };
}

function appointmentOut(a: DemoAppointment) {
  const s = service(a.serviceId);
  return {
    id: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
    source: a.source,
    service: { id: s.id, name: s.name },
    professional: professional(a.professionalId),
    contact: contactRef(a.contactId),
  };
}

function event(type: string, actorType: 'contact' | 'user' | 'system', contactId: string | null) {
  db().events.push({ id: newId('ev'), type, actorType, createdAt: nowIso(), contactId });
}

function moveDeal(contactId: string, key: string) {
  const s = db();
  const stage = s.stages.find((x) => x.key === key);
  const deal = s.deals.find((d) => d.contactId === contactId);
  if (stage && deal && deal.stageId !== stage.id) {
    deal.stageId = stage.id;
    deal.since = nowIso();
  }
}

function lastMessage(conversationId: string) {
  const c = db().conversations.find((x) => x.id === conversationId);
  return c?.messages[c.messages.length - 1] ?? null;
}

// ---------- Leituras ----------

function today() {
  const s = db();
  const date = localDate(new Date());
  return {
    date,
    businessName: s.business.name,
    timeZone: TZ,
    appointments: s.appointments
      .filter((a) => localDate(a.startsAt) === date && a.status !== 'CANCELLED')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(appointmentOut),
    handoffs: s.conversations
      .filter((c) => c.botPausedAt && !c.archivedAt)
      .map((c) => {
        const m = lastMessage(c.id);
        return {
          conversationId: c.id,
          since: c.botPausedAt!,
          contact: contactRef(c.contactId),
          lastMessage: m ? { body: m.body, createdAt: m.createdAt } : null,
        };
      }),
    tasks: s.tasks
      .filter((t) => !t.doneAt)
      .map((t) => {
        const c = t.contactId ? s.contacts.find((x) => x.id === t.contactId) : null;
        return {
          id: t.id,
          title: t.title,
          dueAt: t.dueAt,
          contact: c ? { id: c.id, name: c.name } : null,
        };
      }),
    activity: [...s.events]
      .filter((e) => e.createdAt <= nowIso())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 15)
      .map((e) => ({
        id: e.id,
        type: e.type,
        actorType: e.actorType,
        createdAt: e.createdAt,
        contact: e.contactId ? contactRef(e.contactId) : null,
      })),
  };
}

function report(days: number) {
  const s = db();
  const to = localDate(new Date());
  const from = addDays(to, -(days - 1));
  const inRange = (iso: string) => {
    const d = localDate(iso);
    return d >= from && d <= to;
  };
  const created = s.appointments.filter((a) => inRange(a.createdAt));
  const happened = s.appointments.filter((a) => inRange(a.startsAt));
  const count = (st: AppointmentStatus) => happened.filter((a) => a.status === st).length;
  const done = count('DONE');
  const noShow = count('NO_SHOW');
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return {
      date,
      booked: s.appointments.filter((a) => localDate(a.createdAt) === date).length,
      done: s.appointments.filter((a) => a.status === 'DONE' && localDate(a.startsAt) === date)
        .length,
    };
  });
  return {
    from,
    to,
    days,
    newContacts: s.contacts.filter((c) => inRange(c.createdAt)).length,
    booked: {
      total: created.length,
      byBot: created.filter((a) => a.source === 'WHATSAPP').length,
      byPanel: created.filter((a) => a.source === 'PANEL').length,
    },
    outcomes: {
      done,
      noShow,
      cancelled: count('CANCELLED'),
      noShowRate: done + noShow > 0 ? noShow / (done + noShow) : null,
    },
    handoffs: s.events.filter((e) => e.type === 'handoff.requested' && inRange(e.createdAt)).length,
    optOuts: 0,
    confirmedByClient: happened.filter((a) => a.status === 'CONFIRMED').length,
    daily,
    byStage: s.stages.map((st) => ({
      id: st.id,
      name: st.name,
      count: s.deals.filter((d) => d.stageId === st.id).length,
    })),
    byProfessional: s.professionals.map((p) => ({
      id: p.id,
      name: p.name,
      count: happened.filter((a) => a.professionalId === p.id && a.status === 'DONE').length,
    })),
  };
}

function agenda(from: string, days: number) {
  const end = addDays(from, days);
  return {
    from,
    days,
    timeZone: TZ,
    appointments: db()
      .appointments.filter((a) => {
        const d = localDate(a.startsAt);
        return d >= from && d < end;
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(appointmentOut),
  };
}

function slots(serviceId: string, date: string) {
  const s = db();
  const srv = service(serviceId);
  const wd = weekday(date);
  const earliest = Date.now() + s.business.minNoticeMinutes * 60_000;
  const out: { startsAt: string; endsAt: string }[] = [];
  const busy = s.appointments.filter((a) => a.status !== 'CANCELLED');
  for (const w of s.professionals[0]!.windows.filter((x) => x.weekday === wd)) {
    for (
      let m = w.startMinute;
      m + srv.durationMinutes <= w.endMinute;
      m += s.business.slotStepMinutes
    ) {
      const start = localAt(date, m).getTime();
      const end = start + srv.durationMinutes * 60_000;
      if (start < earliest) continue;
      const clash =
        busy.some((a) => Date.parse(a.startsAt) < end && Date.parse(a.endsAt) > start) ||
        s.timeOff.some((t) => Date.parse(t.startsAt) < end && Date.parse(t.endsAt) > start);
      if (!clash)
        out.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
    }
  }
  return out;
}

function contactStats(contactId: string) {
  const list = db().appointments.filter((a) => a.contactId === contactId);
  const done = list.filter((a) => a.status === 'DONE');
  return {
    doneCount: done.length,
    noShowCount: list.filter((a) => a.status === 'NO_SHOW').length,
    lastDoneAt: done
      .map((a) => a.startsAt)
      .sort()
      .at(-1),
  };
}

function contacts(q: string, segment: string) {
  const s = db();
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  let list = s.contacts.filter(
    (c) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && c.phone.includes(digits)),
  );
  const stats = new Map(list.map((c) => [c.id, contactStats(c.id)]));
  if (segment === 'frequent') list = list.filter((c) => stats.get(c.id)!.doneCount >= 3);
  if (segment === 'missing') {
    const limit = Date.now() - 45 * DAY;
    list = list.filter((c) => {
      const last = stats.get(c.id)!.lastDoneAt;
      const future = s.appointments.some(
        (a) => a.contactId === c.id && a.startsAt > nowIso() && a.status !== 'CANCELLED',
      );
      return last && Date.parse(last) < limit && !future;
    });
  }
  if (segment === 'no_show') list = list.filter((c) => stats.get(c.id)!.noShowCount >= 1);
  return [...list]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => {
      const deal = s.deals.find((d) => d.contactId === c.id);
      const stage = deal ? s.stages.find((st) => st.id === deal.stageId) : null;
      const st = stats.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        optedOutAt: null,
        deals: stage ? [{ stage: { id: stage.id, name: stage.name } }] : [],
        ...(segment === 'frequent' ? { stats: { doneCount: st.doneCount } } : {}),
        ...(segment === 'missing' ? { stats: { lastDoneAt: st.lastDoneAt } } : {}),
        ...(segment === 'no_show' ? { stats: { noShowCount: st.noShowCount } } : {}),
      };
    });
}

function contactFile(id: string) {
  const s = db();
  const c = s.contacts.find((x) => x.id === id);
  if (!c) fail(404, 'Cliente não encontrada.');
  const deal = s.deals.find((d) => d.contactId === id);
  const stage = deal ? s.stages.find((st) => st.id === deal.stageId)! : null;
  return {
    ...c,
    optedOutAt: null,
    timeZone: TZ,
    appointments: s.appointments
      .filter((a) => a.contactId === id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        service: { name: service(a.serviceId).name },
      })),
    tasks: s.tasks
      .filter((t) => t.contactId === id && !t.doneAt)
      .map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt })),
    deal:
      deal && stage
        ? {
            id: deal.id,
            stage: { id: stage.id, name: stage.name },
            stages: s.stages.map((st) => ({ id: st.id, name: st.name })),
          }
        : null,
    conversations: s.conversations
      .filter((cv) => cv.contactId === id)
      .map((cv) => ({
        id: cv.id,
        channel: 'WHATSAPP',
        botPausedAt: cv.botPausedAt,
        messages: cv.messages,
      })),
  };
}

function pipeline() {
  const s = db();
  return {
    id: 'demo-pipeline',
    name: 'Atendimentos',
    timeZone: TZ,
    stages: s.stages.map((st) => ({
      ...st,
      deals: s.deals
        .filter((d) => d.stageId === st.id)
        .map((d) => {
          const next = s.appointments
            .filter(
              (a) =>
                a.contactId === d.contactId &&
                a.startsAt > nowIso() &&
                (a.status === 'SCHEDULED' || a.status === 'CONFIRMED'),
            )
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
          const srv = next ? service(next.serviceId) : null;
          return {
            id: d.id,
            since: d.since,
            nextAt: next?.startsAt ?? null,
            nextService: srv?.name ?? null,
            valueCents: srv?.priceCents ?? null,
            contact: contactRef(d.contactId),
          };
        }),
    })),
  };
}

function goals() {
  const s = db();
  const month = localDate(new Date()).slice(0, 7);
  const done = s.appointments.filter(
    (a) => a.status === 'DONE' && localDate(a.startsAt).slice(0, 7) === month,
  );
  return {
    month,
    goals: s.goals,
    progress: {
      doneCount: done.length,
      revenueCents: done.reduce((sum, a) => sum + (service(a.serviceId).priceCents ?? 0), 0),
    },
  };
}

function conversations(tab: string, q: string) {
  const s = db();
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const week = new Date(Date.now() - 7 * DAY).toISOString();
  const list = s.conversations
    .filter((c) => (tab === 'archived' ? c.archivedAt : !c.archivedAt))
    .filter((c) => tab !== 'waiting' || c.botPausedAt)
    .filter((c) => {
      const contact = s.contacts.find((x) => x.id === c.contactId)!;
      if (tab === 'new' && contact.createdAt < week) return false;
      return (
        !term ||
        contact.name.toLowerCase().includes(term) ||
        (digits.length >= 3 && contact.phone.includes(digits))
      );
    })
    .map((c) => {
      const m = lastMessage(c.id);
      return {
        id: c.id,
        channel: 'WHATSAPP',
        botPausedAt: c.botPausedAt,
        archivedAt: c.archivedAt,
        lastMessageAt: m?.createdAt ?? null,
        contact: contactRef(c.contactId),
        lastMessage: m ? { body: m.body, direction: m.direction, createdAt: m.createdAt } : null,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  return { timeZone: TZ, conversations: list };
}

function conversation(id: string) {
  const c = db().conversations.find((x) => x.id === id);
  if (!c) fail(404, 'Conversa não encontrada.');
  return {
    id: c.id,
    channel: 'WHATSAPP',
    botPausedAt: c.botPausedAt,
    archivedAt: c.archivedAt,
    contact: { ...contactRef(c.contactId), optedOutAt: null },
    messages: c.messages,
    timeZone: TZ,
  };
}

function setup() {
  const s = db();
  return {
    business: s.business,
    services: s.services,
    windows: s.professionals[0]!.windows,
    faq: s.faq,
    onboardingCompletedAt: s.events[0]?.createdAt ?? nowIso(),
  };
}

function team() {
  const s = db();
  return {
    services: s.services.map((x) => ({ id: x.id, name: x.name })),
    professionals: s.professionals.map((p) => ({ ...p, login: null })),
  };
}

function timeOff() {
  const s = db();
  return {
    timeZone: TZ,
    items: s.timeOff
      .filter((t) => t.endsAt > nowIso())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((t) => ({
        id: t.id,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        reason: t.reason,
        professional: t.professionalId ? professional(t.professionalId) : null,
      })),
    professionals: s.professionals.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
  };
}

function ticketSummary(t: DemoStore['tickets'][number]) {
  const { id, topic, subject, status, ownerUnread, createdAt, updatedAt } = t;
  return { id, topic, subject, status, ownerUnread, createdAt, updatedAt };
}

function ticket(id: string) {
  const t = db().tickets.find((x) => x.id === id);
  if (!t) fail(404, 'Chamado não encontrado.');
  return t;
}

function me() {
  const s = db();
  return {
    name: s.ownerName,
    role: 'OWNER',
    csrfToken: 'demo',
    mustChangePassword: false,
    businessName: s.business.name,
    onboardingPending: false,
    plan: 'COMPLETE',
    features: ['report', 'agenda', 'bot', 'reminders'],
    acting: null,
  };
}

// ---------- Rotas ----------

type Body = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Responde a uma chamada da API como o servidor faria, mas na memória. */
export async function demoRequest(
  method: string,
  fullPath: string,
  query: Record<string, string> = {},
  rawBody?: unknown,
): Promise<unknown> {
  const [path = '', inline = ''] = fullPath.split('?');
  const q = { ...Object.fromEntries(new URLSearchParams(inline)), ...query };
  const body = (rawBody ?? {}) as Body;
  const s = db();
  const m = method.toUpperCase();
  const seg = path.split('/').filter(Boolean);
  // Um pouco de espera, como na rede, para a tela mostrar o "carregando" de verdade.
  await new Promise((r) => setTimeout(r, 60));

  const route = `${m} /${seg.map((p, i) => (i > 1 && /^demo-/.test(p) ? ':id' : p)).join('/')}`;
  const idParam = seg.find((p, i) => i > 1 && /^demo-/.test(p)) ?? '';

  switch (route) {
    // Conta
    case 'GET /auth/me':
      return me();
    case 'GET /auth/options':
      return { signupEnabled: true, passwordResetEnabled: true };
    case 'GET /auth/profile':
      return { name: s.ownerName, email: 'ana@exemplo.test', twoFactor: false, otherSessions: 0 };
    case 'POST /auth/profile': {
      const name = str(body.name).trim();
      if (name.length < 2) fail(400, 'Escreva seu nome (pelo menos 2 letras).');
      s.ownerName = name;
      return { name, email: 'ana@exemplo.test' };
    }
    case 'POST /auth/password':
      fail(400, 'Na demonstração não dá para trocar a senha.');
    // eslint-disable-next-line no-fallthrough
    case 'POST /auth/sessions/revoke-others':
      return { revoked: 0 };
    case 'POST /auth/logout':
      leaveDemo();
      resetDemo();
      window.location.hash = '/';
      return { ok: true };

    // Hoje, agenda e resultados
    case 'GET /panel/today':
      return today();
    case 'GET /panel/report':
      return report([7, 30, 90].includes(Number(q.days)) ? Number(q.days) : 30);
    case 'GET /panel/agenda':
      return agenda(
        q.from || localDate(new Date()),
        Math.min(Math.max(Number(q.days) || 1, 1), 42),
      );
    case 'GET /panel/services':
      return s.services;
    case 'GET /panel/slots':
      return slots(q.serviceId ?? '', q.date ?? localDate(new Date()));
    case 'POST /panel/appointments': {
      const srv = service(str(body.serviceId));
      contactRef(str(body.contactId));
      const start = new Date(str(body.startsAt));
      if (Number.isNaN(start.getTime())) fail(400, 'Escolha um horário.');
      const a: DemoAppointment = {
        id: newId('ap'),
        contactId: str(body.contactId),
        serviceId: srv.id,
        professionalId: s.professionals[0]!.id,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + srv.durationMinutes * 60_000).toISOString(),
        status: 'SCHEDULED',
        source: 'PANEL',
        createdAt: nowIso(),
      };
      s.appointments.push(a);
      event('appointment.created', 'user', a.contactId);
      moveDeal(a.contactId, 'scheduled');
      return appointmentOut(a);
    }
    case 'POST /panel/appointments/:id/status': {
      const a = s.appointments.find((x) => x.id === idParam);
      if (!a) fail(404, 'Horário não encontrado.');
      const status = str(body.status) as AppointmentStatus;
      a.status = status;
      const type = {
        CONFIRMED: 'appointment.confirmed',
        DONE: 'appointment.done',
        NO_SHOW: 'appointment.no_show',
        CANCELLED: 'appointment.cancelled',
      }[status as string];
      if (type) event(type, 'user', a.contactId);
      if (status === 'DONE') moveDeal(a.contactId, 'attended');
      return appointmentOut(a);
    }
    case 'POST /panel/appointments/:id/reschedule': {
      const a = s.appointments.find((x) => x.id === idParam);
      if (!a) fail(404, 'Horário não encontrado.');
      const start = new Date(str(body.startsAt));
      const length = Date.parse(a.endsAt) - Date.parse(a.startsAt);
      a.startsAt = start.toISOString();
      a.endsAt = new Date(start.getTime() + length).toISOString();
      event('appointment.rescheduled', 'user', a.contactId);
      return appointmentOut(a);
    }

    // Clientes
    case 'GET /panel/contacts':
      return contacts(q.q ?? '', q.segment ?? '');
    case 'POST /panel/contacts': {
      const name = str(body.name).trim();
      const phone = str(body.phone).replace(/\D/g, '');
      if (!name) fail(400, 'Escreva o nome da cliente.');
      if (!/^\d{10,15}$/.test(phone)) fail(400, 'Telefone com DDD, só números.');
      const id = newId('c');
      s.contacts.push({
        id,
        name,
        phone,
        createdAt: nowIso(),
        notes: null,
        tags: [],
        source: 'PANEL',
      });
      s.deals.push({ id: newId('d'), contactId: id, stageId: s.stages[0]!.id, since: nowIso() });
      event('contact.created', 'user', id);
      return { id, name, phone };
    }
    case 'GET /panel/contacts/:id':
      return contactFile(idParam);
    case 'PATCH /panel/contacts/:id': {
      const c = s.contacts.find((x) => x.id === idParam);
      if (!c) fail(404, 'Cliente não encontrada.');
      if (typeof body.name === 'string') c.name = body.name.trim() || c.name;
      if ('notes' in body) c.notes = (body.notes as string | null) ?? null;
      if (Array.isArray(body.tags)) c.tags = body.tags.map(String);
      return contactFile(c.id);
    }
    case 'GET /panel/contacts/:id/export':
      return contactFile(idParam);
    case 'POST /panel/contacts/:id/erase':
      fail(400, 'Na demonstração não dá para excluir os dados de uma cliente.');
    // eslint-disable-next-line no-fallthrough
    case 'POST /panel/tasks/:id/done': {
      const t = s.tasks.find((x) => x.id === idParam);
      if (!t) fail(404, 'Lembrete não encontrado.');
      t.doneAt = nowIso();
      return { ok: true };
    }

    // Etapas e metas
    case 'GET /panel/pipeline':
      return pipeline();
    case 'GET /panel/pipeline/rules':
      return { stages: s.stages.map((st) => ({ id: st.id, name: st.name })), rules: s.rules };
    case 'PUT /panel/pipeline/rules':
      if (Array.isArray(body.rules)) s.rules = body.rules as DemoStore['rules'];
      return { stages: s.stages.map((st) => ({ id: st.id, name: st.name })), rules: s.rules };
    case 'POST /panel/deals/:id/stage': {
      const deal = s.deals.find((d) => d.id === idParam);
      const stage = s.stages.find((st) => st.id === str(body.stageId));
      if (!deal || !stage) fail(404, 'Etapa não encontrada.');
      deal.stageId = stage.id;
      deal.since = nowIso();
      return { ok: true };
    }
    case 'GET /panel/goals':
      return goals();
    case 'PUT /panel/goals':
      s.goals = {
        doneCount: (body.doneCount as number | null | undefined) ?? null,
        revenueCents: (body.revenueCents as number | null | undefined) ?? null,
      };
      return goals();

    // Conversas
    case 'GET /panel/conversations':
      return conversations(q.tab ?? 'open', q.q ?? '');
    case 'GET /panel/conversations/:id':
      return conversation(idParam);
    case 'POST /panel/conversations/:id/archive': {
      const c = s.conversations.find((x) => x.id === idParam);
      if (!c) fail(404, 'Conversa não encontrada.');
      c.archivedAt = body.archived ? nowIso() : null;
      return { ok: true };
    }
    case 'POST /panel/conversations/:id/resume': {
      const c = s.conversations.find((x) => x.id === idParam);
      if (!c) fail(404, 'Conversa não encontrada.');
      c.botPausedAt = null;
      return { ok: true };
    }
    case 'POST /panel/conversations/:id/messages': {
      const c = s.conversations.find((x) => x.id === idParam);
      if (!c) fail(404, 'Conversa não encontrada.');
      const text = str(body.text).trim();
      if (!text) fail(400, 'Escreva a mensagem.');
      c.botPausedAt ??= nowIso();
      c.archivedAt = null;
      const msg = {
        id: newId('m'),
        direction: 'OUTBOUND' as const,
        type: 'text',
        body: text,
        status: 'sent',
        createdAt: nowIso(),
      };
      c.messages.push(msg);
      return msg;
    }

    // Configurações
    case 'GET /panel/setup':
    case 'POST /panel/setup/complete':
      return setup();
    case 'PUT /panel/setup/business':
      s.business = { ...s.business, ...(body as Partial<DemoStore['business']>) };
      return setup();
    case 'PUT /panel/setup/services':
      if (Array.isArray(body.services)) {
        s.services = (body.services as DemoStore['services']).map((x) => ({
          ...x,
          id: x.id ?? newId('srv'),
        }));
      }
      return setup();
    case 'PUT /panel/setup/hours':
      if (Array.isArray(body.windows)) s.professionals[0]!.windows = body.windows as never;
      return setup();
    case 'PUT /panel/setup/faq':
      if (Array.isArray(body.faq)) s.faq = body.faq as DemoStore['faq'];
      return setup();
    case 'GET /panel/setup/messages':
      return {
        messages: botMessages.messages.map((msg) => ({
          ...msg,
          custom: s.messages.find((x) => x.key === msg.key)?.custom ?? null,
        })),
      };
    case 'PUT /panel/setup/messages':
      if (Array.isArray(body.messages)) {
        for (const item of body.messages as {
          key: string;
          custom?: string | null;
          text?: string | null;
        }[]) {
          const row = s.messages.find((x) => x.key === item.key);
          if (row) row.custom = item.custom ?? item.text ?? null;
        }
      }
      return { ok: true };
    case 'GET /panel/setup/alerts':
      return s.alerts;
    case 'PUT /panel/setup/alerts':
      s.alerts = { ...s.alerts, ...(body as Partial<DemoStore['alerts']>), emailAvailable: false };
      return s.alerts;
    case 'GET /panel/team':
      return team();
    case 'POST /panel/team': {
      const name = str(body.name).trim();
      if (!name) fail(400, 'Escreva o nome.');
      s.professionals.push({
        id: newId('pro'),
        name,
        active: true,
        isOwner: false,
        serviceIds: [],
        windows: [],
      });
      return team();
    }
    case 'PUT /panel/team/:id': {
      const p = s.professionals.find((x) => x.id === idParam);
      if (!p) fail(404, 'Profissional não encontrada.');
      Object.assign(p, body);
      return team();
    }
    case 'POST /panel/team/:id/login':
    case 'DELETE /panel/team/:id/login':
      fail(400, 'Na demonstração não dá para criar acesso para a equipe.');
    // eslint-disable-next-line no-fallthrough
    case 'GET /panel/time-off':
      return timeOff();
    case 'POST /panel/time-off': {
      const startDate = str(body.startDate);
      const endDate = str(body.endDate) || startDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) fail(400, 'Escolha o dia.');
      const toMin = (t: unknown) => {
        const [h, mm] = str(t).split(':').map(Number);
        return (h ?? 0) * 60 + (mm ?? 0);
      };
      const startsAt = body.startTime
        ? localAt(startDate, toMin(body.startTime))
        : localAt(startDate, 0);
      const endsAt = body.endTime
        ? localAt(startDate, toMin(body.endTime))
        : localAt(addDays(endDate, 1), 0);
      s.timeOff.push({
        id: newId('off'),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: (body.reason as string | null) ?? null,
        professionalId: (body.professionalId as string | null) ?? null,
      });
      const conflicts = s.appointments
        .filter(
          (a) =>
            a.status !== 'CANCELLED' &&
            Date.parse(a.startsAt) < endsAt.getTime() &&
            Date.parse(a.endsAt) > startsAt.getTime(),
        )
        .map(appointmentOut);
      return { conflicts };
    }
    case 'DELETE /panel/time-off/:id':
      s.timeOff = s.timeOff.filter((t) => t.id !== idParam);
      return { ok: true };

    // Suporte (fica só na demo: nenhum chamado chega à nexo)
    case 'GET /panel/support':
      return [...s.tickets]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(ticketSummary);
    case 'GET /panel/support/unread':
      return { count: s.tickets.filter((t) => t.ownerUnread).length };
    case 'POST /panel/support': {
      const subject = str(body.subject).trim();
      const description = str(body.description).trim();
      if (subject.length < 3) fail(400, 'Escreva um resumo (pelo menos 3 letras).');
      if (description.length < 10) fail(400, 'Conte um pouco mais (pelo menos 10 letras).');
      const t = {
        id: newId('tk'),
        topic: str(body.topic) || 'outro',
        subject,
        status: 'OPEN' as const,
        ownerUnread: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        description,
        messages: [
          {
            id: newId('tkm'),
            authorType: 'owner' as const,
            authorName: s.ownerName,
            body: description,
            createdAt: nowIso(),
          },
        ],
      };
      s.tickets.push(t);
      return ticketSummary(t);
    }
    case 'GET /panel/support/:id': {
      const t = ticket(idParam);
      t.ownerUnread = false;
      return t;
    }
    case 'POST /panel/support/:id/messages': {
      const t = ticket(idParam);
      const text = str(body.body).trim();
      if (!text) fail(400, 'Escreva a mensagem.');
      t.messages.push({
        id: newId('tkm'),
        authorType: 'owner',
        authorName: s.ownerName,
        body: text,
        createdAt: nowIso(),
      });
      t.status = 'OPEN';
      t.updatedAt = nowIso();
      return t;
    }
    case 'POST /panel/support/:id/close': {
      const t = ticket(idParam);
      t.status = 'CLOSED';
      t.updatedAt = nowIso();
      return ticketSummary(t);
    }

    // Nex: na demo, só os atalhos (nada vai para o Google).
    case 'GET /panel/assistant':
      return { enabled: false, left: 0 };
  }
  fail(404, NOT_HERE);
}
