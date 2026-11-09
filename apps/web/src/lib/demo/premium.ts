import { FEATURES } from '@nexo/core';
import { ApiError } from '../api';
import type { BoardElement } from '@nexo/core';
import { type DemoStore, localDate } from './data';

/**
 * Parte Premium da demonstração: CRM, painéis, carteira, chat, Wiki, quadro, marca e modelos.
 * Tudo fictício e só na memória da aba. O que depende de servidor de verdade (enviar arquivo,
 * verificar domínio) responde com um aviso.
 */

export const PREMIUM_FEATURES = [...FEATURES];
export const UNHANDLED = Symbol('unhandled');

const DAY = 86_400_000;
const NOT_SAVED = 'Na demonstração isto não fica salvo.';
type Body = Record<string, unknown>;

interface ChatRoom {
  id: string;
  kind: 'channel' | 'direct';
  name: string;
  general: boolean;
  withUserId: string | null;
  messages: { id: string; authorId: string; body: string | null; at: string }[];
  readAt: string;
}

interface WikiArticle {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  pinned: boolean;
  updatedAt: string;
  updatedByName: string;
}

interface Template {
  id: string;
  channel: 'whatsapp' | 'email';
  name: string;
  subject: string | null;
  body: string;
}

interface PremiumStore {
  people: { id: string; name: string; role: string }[];
  rooms: ChatRoom[];
  categories: { id: string; name: string }[];
  articles: WikiArticle[];
  boards: { id: string; title: string; elements: BoardElement[]; version: number; at: string }[];
  templates: Template[];
  brand: { color: string | null; font: string | null };
  goals: Record<string, number>;
  rules: { attentionDays: number; riskDays: number; lostDays: number };
  seq: number;
}

const ME = 'demo-u-1';
let premium: PremiumStore | null = null;

export function resetPremium(): void {
  premium = null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function createPremium(owner: string): PremiumStore {
  const now = Date.now();
  const people = [
    { id: ME, name: owner, role: 'OWNER' },
    { id: 'demo-u-2', name: 'Bia (demo)', role: 'MANAGER' },
    { id: 'demo-u-3', name: 'Carla (demo)', role: 'STAFF' },
  ];
  const m = (id: string, authorId: string, body: string, minutesAgo: number) => ({
    id,
    authorId,
    body,
    at: iso(now - minutesAgo * 60_000),
  });
  return {
    people,
    rooms: [
      {
        id: 'demo-ch-geral',
        kind: 'channel',
        name: 'Geral',
        general: true,
        withUserId: null,
        readAt: iso(now - 90 * 60_000),
        messages: [
          m(
            'demo-cm-1',
            'demo-u-2',
            'Bom dia! Chegou a caixa de cola nova, guardei no armário.',
            240,
          ),
          m('demo-cm-2', ME, 'Ótimo, obrigada. Amanhã abro às 9h.', 200),
          m(
            'demo-cm-3',
            'demo-u-3',
            'A cliente das 15h pediu para trocar para 16h, já remarquei.',
            30,
          ),
        ],
      },
      {
        id: 'demo-ch-estoque',
        kind: 'channel',
        name: 'Estoque',
        general: false,
        withUserId: null,
        readAt: iso(now),
        messages: [m('demo-cm-4', 'demo-u-2', 'Fios 0,07 acabando. Faço o pedido?', 1500)],
      },
      {
        id: 'demo-dm-bia',
        kind: 'direct',
        name: 'Bia (demo)',
        general: false,
        withUserId: 'demo-u-2',
        readAt: iso(now - 60 * 60_000),
        messages: [m('demo-cm-5', 'demo-u-2', 'Posso sair 17h na sexta?', 20)],
      },
    ],
    categories: [
      { id: 'demo-wc-1', name: 'Atendimento' },
      { id: 'demo-wc-2', name: 'Rotina do estúdio' },
    ],
    articles: [
      {
        id: 'demo-wa-1',
        title: 'Como receber uma cliente nova (demo)',
        categoryId: 'demo-wc-1',
        pinned: true,
        updatedAt: iso(now - 2 * DAY),
        updatedByName: owner,
        body: '## Antes do horário\n\n- Conferir a ficha da cliente.\n- Separar o material.\n\n## Na chegada\n\n1. Oferecer água.\n2. Perguntar se tem alergia ou sensibilidade.\n3. Explicar o passo a passo do serviço.\n\nTexto de exemplo da demonstração.',
      },
      {
        id: 'demo-wa-2',
        title: 'Fechamento do dia (demo)',
        categoryId: 'demo-wc-2',
        pinned: false,
        updatedAt: iso(now - 6 * DAY),
        updatedByName: 'Bia (demo)',
        body: '- Marcar no painel quem veio e quem **faltou**.\n- Limpar as pinças e a maca.\n- Conferir a agenda de amanhã.',
      },
    ],
    boards: [
      {
        id: 'demo-bd-1',
        title: 'Ideias para o Instagram (demo)',
        version: 1,
        at: iso(now - DAY),
        elements: [
          {
            id: 'r1',
            type: 'rect',
            x: 40,
            y: 40,
            w: 220,
            h: 110,
            color: '#6A1FE8',
            width: 2,
            fill: false,
          },
          {
            id: 't1',
            type: 'text',
            x: 60,
            y: 70,
            w: 180,
            h: 40,
            color: '#100C24',
            text: 'Antes e depois',
            size: 24,
          },
          { id: 'a1', type: 'arrow', x: 270, y: 95, w: 120, h: 0, color: '#2F5BFF', width: 4 },
          {
            id: 'e1',
            type: 'ellipse',
            x: 400,
            y: 45,
            w: 200,
            h: 100,
            color: '#16A34A',
            width: 2,
            fill: false,
          },
          {
            id: 't2',
            type: 'text',
            x: 430,
            y: 75,
            w: 150,
            h: 40,
            color: '#100C24',
            text: 'Promoção',
            size: 24,
          },
        ],
      },
    ],
    templates: [
      {
        id: 'demo-tp-1',
        channel: 'whatsapp',
        name: 'Confirmar horário',
        subject: null,
        body: 'Oi, {primeiro_nome}! Seu horário de {servico} no {negocio} está marcado para {data} às {hora}. Posso confirmar?',
      },
      {
        id: 'demo-tp-2',
        channel: 'whatsapp',
        name: 'Lembrar a manutenção',
        subject: null,
        body: 'Oi, {primeiro_nome}! Já faz um tempinho desde o seu último atendimento. Quer marcar a manutenção?',
      },
      {
        id: 'demo-tp-3',
        channel: 'email',
        name: 'Boas-vindas',
        subject: 'Bem-vinda ao {negocio}',
        body: 'Olá, {nome}!\n\nObrigada por escolher o {negocio}. Qualquer dúvida, é só responder este e-mail.',
      },
    ],
    brand: { color: null, font: null },
    goals: { newContacts: 20, doneCount: 40 },
    rules: { attentionDays: 30, riskDays: 45, lostDays: 90 },
    seq: 0,
  };
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message, { message });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function newId(p: PremiumStore, prefix: string): string {
  p.seq += 1;
  return `demo-${prefix}-n${p.seq.toString(36)}`;
}

/** Atende as rotas do Premium. Devolve UNHANDLED para o servidor da demo seguir. */
export function premiumRequest(
  s: DemoStore,
  route: string,
  ids: string[],
  q: Record<string, string>,
  body: Body,
): unknown {
  const p = (premium ??= createPremium(s.ownerName));
  const idParam = ids[0] ?? '';
  const person = (id: string) => p.people.find((x) => x.id === id);
  const contact = (id: string) => {
    const c = s.contacts.find((x) => x.id === id);
    return c ? { id: c.id, name: c.name, phone: c.phone } : null;
  };
  const price = (serviceId: string) => s.services.find((x) => x.id === serviceId)?.priceCents ?? 0;

  switch (route) {
    // Painel geral (Hoje) e Painéis
    case 'GET /panel/crm/overview':
      return {
        stages: s.stages.map((st) => ({
          id: st.id,
          name: st.name,
          kind: st.kind,
          count: s.deals.filter((d) => d.stageId === st.id).length,
        })),
        forecast: forecast(s),
        monthRevenueCents: revenue(s, 30),
        openTickets: s.tickets.filter((t) => t.status !== 'CLOSED').length,
      };
    case 'GET /panel/crm/dashboard':
      return dashboard(s, p, q.period === 'week' || q.period === 'quarter' ? q.period : 'month');
    case 'PUT /panel/crm/dashboard/goals': {
      const goals = (body.goals ?? body) as Record<string, unknown>;
      for (const [k, v] of Object.entries(goals)) {
        if (typeof v === 'number' && v >= 0) p.goals[k] = v;
        else if (v === null) delete p.goals[k];
      }
      return { ok: true };
    }

    // CRM
    case 'GET /panel/crm/pipelines':
      return [
        {
          id: 'demo-pipeline',
          name: 'Atendimentos',
          isDefault: true,
          openDeals: s.deals.length,
          stages: s.stages.map((st) => ({
            ...st,
            probability: st.kind === 'WON' ? 100 : st.kind === 'LOST' ? 0 : null,
          })),
        },
      ];
    case 'GET /panel/crm/campaigns':
      return [
        {
          id: 'demo-cp-1',
          name: 'Dia das mães (demo)',
          channel: 'Instagram',
          startsOn: localDate(new Date(Date.now() - 20 * DAY)),
          endsOn: localDate(new Date(Date.now() + 10 * DAY)),
          budgetCents: null,
          archivedAt: null,
          pipeline: { id: 'demo-pipeline', name: 'Atendimentos' },
          deals: 4,
          won: 1,
          wonCents: 18000,
        },
      ];
    case 'GET /panel/crm/fields':
      return [
        {
          id: 'demo-f-1',
          label: 'Como conheceu',
          type: 'select',
          options: ['Instagram', 'Indicação', 'Passou na frente'],
        },
      ];
    case 'GET /panel/crm/people':
      return p.people;
    case 'GET /panel/crm/tasks': {
      const done = q.done === 'true';
      return s.tasks
        .filter((t) => Boolean(t.doneAt) === done)
        .map((t) => ({
          id: t.id,
          title: t.title,
          kind: 'follow_up',
          dueAt: t.dueAt,
          doneAt: t.doneAt,
          dealId: null,
          contact: t.contactId ? contact(t.contactId) : null,
          assignee: { id: ME, name: s.ownerName },
        }));
    }
    case 'POST /panel/crm/tasks/:id/reopen': {
      const t = s.tasks.find((x) => x.id === idParam);
      if (!t) fail(404, 'Tarefa não encontrada.');
      t.doneAt = null;
      return { ok: true };
    }
    case 'GET /panel/crm/portfolio':
      return portfolio(s, p, price);
    case 'PUT /panel/crm/portfolio/rules': {
      const a = Number(body.attentionDays);
      const r = Number(body.riskDays);
      const l = Number(body.lostDays);
      if (!(a > 0 && r > a && l > r))
        fail(400, 'Os prazos precisam crescer: atenção, risco e perdida.');
      p.rules = { attentionDays: a, riskDays: r, lostDays: l };
      return p.rules;
    }
    case 'GET /panel/access':
      return {
        available: true,
        requireMfa: false,
        rules: {
          MANAGER: { reports: true, settings: true, privacy: true },
          CONSULTANT: { reports: true, settings: false, privacy: false },
          STAFF: { reports: false, settings: false, privacy: false },
        },
      };

    // Chat da equipe
    case 'GET /panel/chat': {
      const row = (r: ChatRoom) => {
        const last = r.messages.at(-1);
        return {
          id: r.id,
          kind: r.kind,
          name: r.name,
          general: r.general,
          withUserId: r.withUserId,
          createdById: ME,
          unread: r.messages.filter((x) => x.authorId !== ME && x.at > r.readAt).length,
          last: last
            ? { authorName: person(last.authorId)?.name ?? '', body: last.body, at: last.at }
            : null,
        };
      };
      const rows = p.rooms.map(row);
      return {
        me: ME,
        channels: rows.filter((r) => r.kind === 'channel'),
        directs: rows.filter((r) => r.kind === 'direct'),
        people: p.people.filter((x) => x.id !== ME),
        unread: rows.reduce((n, r) => n + r.unread, 0),
      };
    }
    case 'GET /panel/chat/:id/messages': {
      const r = room(p, idParam);
      return {
        more: false,
        messages: r.messages.map((x) => ({
          id: x.id,
          authorId: x.authorId,
          authorName: person(x.authorId)?.name ?? '',
          body: x.body,
          deleted: x.body === null,
          mine: x.authorId === ME,
          at: x.at,
        })),
      };
    }
    case 'POST /panel/chat/:id/messages': {
      const r = room(p, idParam);
      const text = str(body.body).trim();
      if (!text) fail(400, 'Escreva a mensagem.');
      const msg = { id: newId(p, 'cm'), authorId: ME, body: text, at: new Date().toISOString() };
      r.messages.push(msg);
      r.readAt = msg.at;
      return { id: msg.id };
    }
    case 'POST /panel/chat/:id/read':
      room(p, idParam).readAt = new Date().toISOString();
      return { ok: true };
    case 'DELETE /panel/chat/:id/messages/:id': {
      for (const r of p.rooms) {
        const msg = r.messages.find((x) => x.id === ids[1] && x.authorId === ME);
        if (msg) msg.body = null;
      }
      return { ok: true };
    }
    case 'POST /panel/chat/channels': {
      const name = str(body.name).trim();
      if (name.length < 2) fail(400, 'Dê um nome ao canal.');
      const r: ChatRoom = {
        id: newId(p, 'ch'),
        kind: 'channel',
        name,
        general: false,
        withUserId: null,
        messages: [],
        readAt: new Date().toISOString(),
      };
      p.rooms.push(r);
      return { id: r.id };
    }
    case 'POST /panel/chat/direct': {
      const other = person(str(body.userId));
      if (!other) fail(404, 'Pessoa não encontrada.');
      let r = p.rooms.find((x) => x.withUserId === other.id);
      if (!r) {
        r = {
          id: newId(p, 'dm'),
          kind: 'direct',
          name: other.name,
          general: false,
          withUserId: other.id,
          messages: [],
          readAt: new Date().toISOString(),
        };
        p.rooms.push(r);
      }
      return { id: r.id };
    }
    case 'POST /panel/chat/channels/:id/archive': {
      const r = room(p, idParam);
      if (r.general) fail(400, 'O canal Geral não sai.');
      p.rooms = p.rooms.filter((x) => x !== r);
      return { ok: true };
    }

    // Wiki
    case 'GET /panel/wiki': {
      const term = (q.q ?? '').trim().toLowerCase();
      const list = p.articles
        .filter((a) => !q.categoryId || a.categoryId === q.categoryId)
        .filter((a) => !term || `${a.title} ${a.body}`.toLowerCase().includes(term))
        .sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
        );
      return {
        canEdit: true,
        categories: p.categories.map((c) => ({
          ...c,
          count: p.articles.filter((a) => a.categoryId === c.id).length,
        })),
        total: p.articles.length,
        articles: list.map((a) => ({
          id: a.id,
          title: a.title,
          categoryId: a.categoryId,
          pinned: a.pinned,
          updatedAt: a.updatedAt,
          updatedByName: a.updatedByName,
          excerpt: a.body
            .replace(/[#*_>`-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160),
        })),
        usage: { bytes: 0, max: 100 * 1024 * 1024 },
      };
    }
    case 'GET /panel/wiki/articles/:id': {
      const a = article(p, idParam);
      return { ...a, canEdit: true, attachments: [] };
    }
    case 'POST /panel/wiki/articles':
    case 'PUT /panel/wiki/articles/:id': {
      const title = str(body.title).trim();
      if (title.length < 2) fail(400, 'Dê um título ao artigo.');
      const a: WikiArticle = route.startsWith('PUT')
        ? article(p, idParam)
        : {
            id: newId(p, 'wa'),
            title,
            body: '',
            categoryId: null,
            pinned: false,
            updatedAt: '',
            updatedByName: '',
          };
      a.title = title;
      a.body = str(body.body);
      a.categoryId = str(body.categoryId) || null;
      a.pinned = body.pinned === true;
      a.updatedAt = new Date().toISOString();
      a.updatedByName = s.ownerName;
      if (!p.articles.includes(a)) p.articles.push(a);
      return { id: a.id };
    }
    case 'POST /panel/wiki/articles/:id/archive':
      p.articles = p.articles.filter((a) => a.id !== idParam);
      return { ok: true };
    case 'POST /panel/wiki/categories': {
      const name = str(body.name).trim();
      if (name.length < 2) fail(400, 'Dê um nome à categoria.');
      const c = { id: newId(p, 'wc'), name };
      p.categories.push(c);
      return c;
    }

    // Quadro branco
    case 'GET /panel/boards':
      return {
        boards: p.boards.map((b) => ({
          id: b.id,
          title: b.title,
          updatedAt: b.at,
          updatedByName: s.ownerName,
          count: b.elements.length,
          preview: b.elements,
          canArchive: true,
        })),
      };
    case 'POST /panel/boards': {
      const b = {
        id: newId(p, 'bd'),
        title: str(body.title).trim() || 'Quadro sem nome',
        elements: [],
        version: 1,
        at: new Date().toISOString(),
      };
      p.boards.unshift(b);
      return { id: b.id };
    }
    case 'GET /panel/boards/:id': {
      const b = board(p, idParam);
      return {
        id: b.id,
        title: b.title,
        elements: b.elements,
        version: b.version,
        updatedAt: b.at,
        updatedByName: s.ownerName,
        canArchive: true,
      };
    }
    case 'PUT /panel/boards/:id': {
      const b = board(p, idParam);
      if (Array.isArray(body.elements)) b.elements = body.elements as BoardElement[];
      b.version += 1;
      b.at = new Date().toISOString();
      return { version: b.version };
    }
    case 'PUT /panel/boards/:id/title': {
      const b = board(p, idParam);
      b.title = str(body.title).trim() || b.title;
      return { ok: true };
    }
    case 'POST /panel/boards/:id/archive':
      p.boards = p.boards.filter((b) => b.id !== idParam);
      return { ok: true };

    // Marca e modelos
    case 'GET /panel/brand':
      return { name: s.business.name, ...p.brand, logoVersion: null, domain: null };
    case 'PUT /panel/brand':
      p.brand = { color: str(body.color) || null, font: str(body.font) || null };
      return { ok: true };
    case 'PUT /panel/brand/domain':
    case 'POST /panel/brand/domain/verify':
      fail(400, 'Na demonstração não dá para ligar um domínio.');
    // eslint-disable-next-line no-fallthrough
    case 'GET /panel/templates':
      return p.templates.filter((t) => !q.channel || t.channel === q.channel);
    case 'POST /panel/templates':
    case 'PUT /panel/templates/:id': {
      const name = str(body.name).trim();
      if (name.length < 2) fail(400, 'Dê um nome ao modelo.');
      const channel = body.channel === 'email' ? 'email' : 'whatsapp';
      const t: Template = route.startsWith('PUT')
        ? (p.templates.find((x) => x.id === idParam) ?? fail(404, 'Modelo não encontrado.'))
        : { id: newId(p, 'tp'), channel, name, subject: null, body: '' };
      t.name = name;
      t.subject = channel === 'email' ? str(body.subject) : null;
      t.body = str(body.body);
      if (!p.templates.includes(t)) p.templates.push(t);
      return t;
    }
    case 'POST /panel/templates/:id/archive':
      p.templates = p.templates.filter((t) => t.id !== idParam);
      return { ok: true };
  }
  if (/^(POST|PUT|DELETE) \/panel\/(crm|wiki|boards|brand|chat)\//.test(route)) {
    fail(400, NOT_SAVED);
  }
  return UNHANDLED;
}

function room(p: PremiumStore, id: string) {
  return p.rooms.find((r) => r.id === id) ?? fail(404, 'Conversa não encontrada.');
}

function article(p: PremiumStore, id: string) {
  return p.articles.find((a) => a.id === id) ?? fail(404, 'Artigo não encontrado.');
}

function board(p: PremiumStore, id: string) {
  return p.boards.find((b) => b.id === id) ?? fail(404, 'Quadro não encontrado.');
}

function revenue(s: DemoStore, days: number, end = Date.now()): number {
  const from = end - days * DAY;
  return s.appointments
    .filter(
      (a) => a.status === 'DONE' && +new Date(a.startsAt) >= from && +new Date(a.startsAt) < end,
    )
    .reduce((sum, a) => sum + (s.services.find((x) => x.id === a.serviceId)?.priceCents ?? 0), 0);
}

function forecast(s: DemoStore) {
  const open = s.appointments.filter(
    (a) =>
      (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && +new Date(a.startsAt) > Date.now(),
  );
  const cents = open.reduce(
    (sum, a) => sum + (s.services.find((x) => x.id === a.serviceId)?.priceCents ?? 0),
    0,
  );
  const month = localDate(new Date()).slice(0, 7);
  return {
    count: open.length,
    openCents: cents,
    weightedCents: Math.round(cents * 0.8),
    byMonth: [
      { month, count: open.length, openCents: cents, weightedCents: Math.round(cents * 0.8) },
    ],
  };
}

function numbers(s: DemoStore, days: number, end: number) {
  const from = end - days * DAY;
  const inRange = (at: string) => +new Date(at) >= from && +new Date(at) < end;
  const appts = s.appointments.filter((a) => inRange(a.startsAt));
  const done = appts.filter((a) => a.status === 'DONE');
  const rev = revenue(s, days, end);
  const won = s.deals.filter(
    (d) => s.stages.find((st) => st.id === d.stageId)?.kind === 'WON' && inRange(d.since),
  ).length;
  const lost = s.deals.filter(
    (d) => s.stages.find((st) => st.id === d.stageId)?.kind === 'LOST' && inRange(d.since),
  ).length;
  return {
    newContacts: s.contacts.filter((c) => inRange(c.createdAt)).length,
    newDeals: s.deals.filter((d) => inRange(d.since)).length,
    wonCount: won,
    wonCents: rev,
    lostCount: lost,
    conversion: won + lost ? won / (won + lost) : null,
    doneCount: done.length,
    revenueCents: rev,
    noShowCount: appts.filter((a) => a.status === 'NO_SHOW').length,
    averageTicketCents: done.length ? Math.round(rev / done.length) : null,
  };
}

function dashboard(s: DemoStore, p: PremiumStore, period: 'week' | 'month' | 'quarter') {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const end = Date.now();
  const now = numbers(s, days, end);
  const prev = numbers(s, days, end - days * DAY);
  const keys = ['newContacts', 'wonCount', 'doneCount', 'revenueCents'] as const;
  const change = (a: number, b: number) => (b ? (a - b) / b : null);
  const total = s.deals.length || 1;
  const order = s.stages.filter((st) => st.kind !== 'LOST');
  return {
    period,
    from: localDate(new Date(end - days * DAY)),
    to: localDate(new Date(end)),
    pipeline: { id: 'demo-pipeline', name: 'Atendimentos' },
    pipelines: [{ id: 'demo-pipeline', name: 'Atendimentos', isDefault: true }],
    people: p.people.map(({ id, name }) => ({ id, name })),
    numbers: now,
    previous: prev,
    changes: Object.fromEntries(keys.map((k) => [k, change(now[k], prev[k])])),
    goals: p.goals,
    progress: Object.fromEntries(
      keys.map((k) => [k, p.goals[k] ? Math.min(now[k] / p.goals[k]!, 9.99) : 0]),
    ),
    funnel: order.map((st, i) => {
      const reached = s.deals.filter((d) => {
        const at = order.findIndex((x) => x.id === d.stageId);
        return at >= i;
      }).length;
      return { id: st.id, name: st.name, reached, percent: reached / total };
    }),
    byOwner: [
      {
        id: ME,
        name: s.ownerName,
        openDeals: s.deals.length,
        openCents: forecast(s).openCents,
        openTasks: s.tasks.filter((t) => !t.doneAt).length,
      },
    ],
    forecast: forecast(s),
  };
}

function portfolio(s: DemoStore, p: PremiumStore, price: (id: string) => number) {
  const r = p.rules;
  const now = Date.now();
  const clients = s.contacts
    .map((c) => {
      const done = s.appointments
        .filter((a) => a.contactId === c.id && a.status === 'DONE')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      if (done.length === 0) return null;
      const last = done.at(-1)!;
      const daysSince = Math.floor((now - +new Date(last.startsAt)) / DAY);
      const next = s.appointments
        .filter(
          (a) =>
            a.contactId === c.id &&
            (a.status === 'SCHEDULED' || a.status === 'CONFIRMED') &&
            +new Date(a.startsAt) > now,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      const span = done.length > 1 ? +new Date(last.startsAt) - +new Date(done[0]!.startsAt) : 0;
      const status =
        daysSince >= r.lostDays
          ? 'lost'
          : daysSince >= r.riskDays
            ? 'risk'
            : daysSince >= r.attentionDays
              ? 'attention'
              : 'ok';
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        tags: c.tags,
        optedOutAt: null,
        status: next ? 'ok' : status,
        daysSince,
        visits: done.length,
        totalCents: done.reduce((sum, a) => sum + price(a.serviceId), 0),
        avgIntervalDays: done.length > 1 ? Math.round(span / DAY / (done.length - 1)) : null,
        lastDoneAt: last.startsAt,
        nextAt: next?.startsAt ?? null,
      };
    })
    .filter((x) => x !== null);
  const count = (st: string) => clients.filter((c) => c.status === st).length;
  return {
    rules: r,
    summary: {
      ok: count('ok'),
      attention: count('attention'),
      risk: count('risk'),
      lost: count('lost'),
      total: clients.length,
      totalCents: clients.reduce((sum, c) => sum + c.totalCents, 0),
    },
    clients,
  };
}
