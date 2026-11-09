import type { AppointmentStatus } from '../types';
import botMessages from './messages.json';

/**
 * Dados fictícios da demonstração, gerados a partir de agora (sempre "frescos"). Nomes e
 * telefones são inventados e marcados "(demo)"; os telefones usam DDD 00, que não existe.
 * Nada aqui é dado de cliente real nem resultado real da nexo.
 */

export const TZ = 'America/Sao_Paulo';
/** São Paulo está em UTC-3 o ano todo (sem horário de verão desde 2019). */
const OFFSET_H = 3;
const DAY = 86_400_000;

export interface DemoContact {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  notes: string | null;
  tags: string[];
  source: string;
}
export interface DemoAppointment {
  id: string;
  contactId: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: 'WHATSAPP' | 'PANEL';
  createdAt: string;
}
export interface DemoMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string;
  status: string | null;
  createdAt: string;
}
export interface DemoConversation {
  id: string;
  contactId: string;
  botPausedAt: string | null;
  archivedAt: string | null;
  messages: DemoMessage[];
}
export interface DemoEvent {
  id: string;
  type: string;
  actorType: 'contact' | 'user' | 'system';
  createdAt: string;
  contactId: string | null;
}
export interface DemoWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface DemoProfessional {
  id: string;
  name: string;
  active: boolean;
  isOwner: boolean;
  serviceIds: string[];
  windows: DemoWindow[];
}
export interface DemoTicketMessage {
  id: string;
  authorType: 'owner' | 'nexo';
  authorName: string;
  body: string;
  createdAt: string;
}
export interface DemoTicket {
  id: string;
  topic: string;
  subject: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  ownerUnread: boolean;
  createdAt: string;
  updatedAt: string;
  description: string;
  messages: DemoTicketMessage[];
}

export interface DemoStore {
  business: {
    name: string;
    attendantName: string;
    timezone: string;
    slotStepMinutes: number;
    minNoticeMinutes: number;
  };
  ownerName: string;
  services: { id: string; name: string; durationMinutes: number; priceCents: number | null }[];
  professionals: DemoProfessional[];
  faq: { question: string; answer: string }[];
  stages: { id: string; name: string; key: string; kind: 'OPEN' | 'WON' | 'LOST' }[];
  rules: { event: string; defaultStageId: string | null }[];
  contacts: DemoContact[];
  deals: { id: string; contactId: string; stageId: string; since: string }[];
  appointments: DemoAppointment[];
  conversations: DemoConversation[];
  tasks: {
    id: string;
    title: string;
    dueAt: string | null;
    contactId: string | null;
    doneAt: string | null;
  }[];
  events: DemoEvent[];
  timeOff: {
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
    professionalId: string | null;
  }[];
  tickets: DemoTicket[];
  goals: { doneCount?: number | null; revenueCents?: number | null };
  alerts: { notifyEmail: boolean; nextVisitDays: number | null; emailAvailable: boolean };
  messages: { key: string; custom: string | null }[];
  seq: number;
}

/** Data local (fuso do negócio) de um instante, no formato AAAA-MM-DD. */
export function localDate(at: Date | string): string {
  const t = typeof at === 'string' ? new Date(at).getTime() : at.getTime();
  return new Date(t - OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

/** Instante de um dia local (AAAA-MM-DD) num horário local. */
export function localAt(date: string, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 0, minute) + OFFSET_H * 3_600_000);
}

/** Dia da semana (0 = domingo) de uma data local. */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

const NAMES = [
  'Mariana Lopes',
  'Juliana Prado',
  'Camila Rocha',
  'Beatriz Nunes',
  'Larissa Souza',
  'Fernanda Lima',
  'Patrícia Alves',
  'Renata Dias',
  'Aline Costa',
  'Gabriela Melo',
  'Vanessa Reis',
  'Tatiane Ramos',
];

export function createDemoStore(now = new Date()): DemoStore {
  let seq = 0;
  const id = (p: string) => `demo-${p}-${(++seq).toString(36)}`;
  const today = localDate(now);
  const iso = (d: Date) => d.toISOString();
  const at = (dayOffset: number, minute: number) => localAt(addDays(today, dayOffset), minute);

  const services = [
    { id: 'demo-srv-1', name: 'Extensão de cílios (demo)', durationMinutes: 90, priceCents: 18000 },
    {
      id: 'demo-srv-2',
      name: 'Manutenção de cílios (demo)',
      durationMinutes: 60,
      priceCents: 12000,
    },
    {
      id: 'demo-srv-3',
      name: 'Design de sobrancelha (demo)',
      durationMinutes: 40,
      priceCents: 5000,
    },
    { id: 'demo-srv-4', name: 'Lash lifting (demo)', durationMinutes: 60, priceCents: 15000 },
  ];
  const windows: DemoWindow[] = [1, 2, 3, 4, 5, 6].map((w) => ({
    weekday: w,
    startMinute: 540,
    endMinute: 1140,
  }));
  const owner: DemoProfessional = {
    id: 'demo-pro-1',
    name: 'Ana (demo)',
    active: true,
    isOwner: true,
    serviceIds: services.map((s) => s.id),
    windows,
  };

  const stages = [
    { id: 'demo-st-new', name: 'Novo contato', key: 'new', kind: 'OPEN' as const },
    { id: 'demo-st-info', name: 'Pediu informação', key: 'asked_info', kind: 'OPEN' as const },
    { id: 'demo-st-sched', name: 'Agendou', key: 'scheduled', kind: 'OPEN' as const },
    { id: 'demo-st-done', name: 'Atendido', key: 'attended', kind: 'WON' as const },
    { id: 'demo-st-back', name: 'Voltou', key: 'returned', kind: 'OPEN' as const },
    { id: 'demo-st-lost', name: 'Não seguiu', key: 'lost', kind: 'LOST' as const },
  ];

  // Quando cada cliente chegou (dias atrás).
  const arrived = [58, 55, 50, 47, 44, 40, 35, 28, 20, 9, 3, 1];
  const contacts: DemoContact[] = NAMES.map((name, i) => ({
    id: `demo-c-${i + 1}`,
    name: `${name} (demo)`,
    phone: `55009000001${String(i + 1).padStart(2, '0')}`,
    createdAt: iso(at(-arrived[i]!, 600 + i * 17)),
    notes: null,
    tags: [],
    source: 'WHATSAPP',
  }));
  contacts[0]!.notes = 'Prefere horários de manhã. (anotação de exemplo)';
  contacts[0]!.tags = ['fiel'];
  contacts[2]!.tags = ['manutenção'];

  const appointments: DemoAppointment[] = [];
  const events: DemoEvent[] = [];
  const book = (
    c: number,
    dayOffset: number,
    minute: number,
    srv: number,
    status: AppointmentStatus,
    source: 'WHATSAPP' | 'PANEL' = 'WHATSAPP',
  ) => {
    const s = services[srv]!;
    // Domingo o estúdio não abre: passa para o sábado (antes) ou a segunda (depois).
    let day = dayOffset;
    if (day !== 0 && weekday(addDays(today, day)) === 0) day += day < 0 ? -1 : 1;
    const start = at(day, minute);
    const createdAt = new Date(start.getTime() - (2 + ((c + srv) % 4)) * DAY - 5 * 3_600_000);
    const created = createdAt > now ? new Date(now.getTime() - 3_600_000) : createdAt;
    const a: DemoAppointment = {
      id: id('ap'),
      contactId: contacts[c]!.id,
      serviceId: s.id,
      professionalId: owner.id,
      startsAt: iso(start),
      endsAt: iso(new Date(start.getTime() + s.durationMinutes * 60_000)),
      status,
      source,
      createdAt: iso(created),
    };
    appointments.push(a);
    events.push({
      id: id('ev'),
      type: 'appointment.created',
      actorType: source === 'WHATSAPP' ? 'contact' : 'user',
      createdAt: a.createdAt,
      contactId: a.contactId,
    });
    if (status === 'DONE' || status === 'NO_SHOW' || status === 'CANCELLED') {
      events.push({
        id: id('ev'),
        type:
          status === 'DONE'
            ? 'appointment.done'
            : status === 'NO_SHOW'
              ? 'appointment.no_show'
              : 'appointment.cancelled',
        actorType: status === 'CANCELLED' ? 'contact' : 'user',
        createdAt: iso(
          status === 'CANCELLED'
            ? new Date(start.getTime() - DAY)
            : new Date(start.getTime() + s.durationMinutes * 60_000),
        ),
        contactId: a.contactId,
      });
    }
    return a;
  };

  // Histórico dos últimos 60 dias: clientes fiéis voltam a cada 3 a 4 semanas.
  book(0, -56, 600, 0, 'DONE');
  book(0, -33, 600, 1, 'DONE');
  book(0, -10, 570, 1, 'DONE');
  book(1, -52, 840, 0, 'DONE');
  book(1, -29, 840, 1, 'DONE');
  book(1, -6, 900, 1, 'DONE', 'PANEL');
  book(2, -48, 660, 0, 'DONE');
  book(2, -24, 660, 1, 'DONE');
  book(3, -45, 960, 2, 'DONE');
  book(3, -20, 960, 2, 'NO_SHOW');
  book(4, -43, 720, 3, 'DONE');
  book(5, -39, 600, 0, 'DONE');
  book(5, -16, 630, 1, 'DONE');
  book(6, -34, 1020, 2, 'DONE');
  book(6, -12, 1020, 2, 'CANCELLED');
  book(7, -27, 780, 0, 'DONE');
  book(7, -5, 780, 1, 'NO_SHOW');
  book(8, -19, 690, 3, 'DONE');
  book(8, -2, 690, 2, 'DONE', 'PANEL');
  book(4, -15, 900, 2, 'DONE');
  book(2, -3, 600, 2, 'DONE');
  book(5, -1, 1000, 2, 'DONE');

  // Hoje: o que já passou fica realizado; o resto, marcado.
  const nowMinute = Math.floor((now.getTime() - localAt(today, 0).getTime()) / 60_000);
  for (const [c, minute, srv] of [
    [1, 570, 1],
    [9, 690, 0],
    [3, 870, 2],
    [10, 990, 0],
  ] as const) {
    const done = minute + services[srv]!.durationMinutes < nowMinute;
    book(c, 0, minute, srv, done ? 'DONE' : c === 3 ? 'CONFIRMED' : 'SCHEDULED');
  }
  // Próximos dias.
  book(0, 1, 600, 1, 'CONFIRMED');
  book(5, 1, 900, 1, 'SCHEDULED');
  book(2, 2, 720, 1, 'SCHEDULED');
  book(11, 3, 840, 0, 'SCHEDULED');
  book(6, 4, 660, 2, 'SCHEDULED', 'PANEL');
  book(8, 6, 960, 1, 'SCHEDULED');
  book(4, 8, 600, 3, 'SCHEDULED');

  for (const c of contacts) {
    events.push({
      id: id('ev'),
      type: 'contact.created',
      actorType: 'contact',
      createdAt: c.createdAt,
      contactId: c.id,
    });
  }

  // Etapa de cada cliente.
  const stageOf = [
    'back',
    'back',
    'back',
    'done',
    'sched',
    'back',
    'sched',
    'lost',
    'sched',
    'done',
    'info',
    'new',
  ];
  const deals = contacts.map((c, i) => ({
    id: `demo-d-${i + 1}`,
    contactId: c.id,
    stageId: `demo-st-${stageOf[i]}`,
    since: iso(new Date(now.getTime() - ((i * 3) % 11) * DAY - 3_600_000)),
  }));

  // Conversas pelo WhatsApp (simuladas).
  const conv = (
    c: number,
    minutesAgo: number,
    lines: [dir: 'in' | 'out', text: string][],
    paused = false,
    archived = false,
  ): DemoConversation => {
    const start = now.getTime() - minutesAgo * 60_000;
    return {
      id: `demo-cv-${c + 1}`,
      contactId: contacts[c]!.id,
      botPausedAt: paused ? iso(new Date(start + (lines.length - 1) * 60_000)) : null,
      archivedAt: archived ? iso(new Date(start + lines.length * 60_000)) : null,
      messages: lines.map(([dir, text], k) => ({
        id: id('m'),
        direction: dir === 'in' ? 'INBOUND' : 'OUTBOUND',
        type: 'text',
        body: text,
        status: dir === 'out' ? 'read' : null,
        createdAt: iso(new Date(start + k * 60_000)),
      })),
    };
  };
  const conversations = [
    conv(
      11,
      25,
      [
        ['in', 'Oi, boa tarde! Vocês fazem extensão de cílios?'],
        [
          'out',
          'Oi! Aqui é o atendimento automático do Estúdio Exemplo (demo). Como posso ajudar?',
        ],
        ['in', 'Falar com a Ana'],
        ['out', 'Certo! Já avisei a Ana. Ela responde por aqui assim que puder.'],
        ['in', 'Queria saber se dá para fazer cílios e sobrancelha no mesmo dia'],
      ],
      true,
    ),
    conv(10, 140, [
      ['in', 'Oi! Quanto custa a manutenção?'],
      ['out', 'Como posso ajudar? Escolha uma opção.'],
      ['in', 'Dúvidas'],
      ['out', 'Manutenção de cílios (demo): R$ 120,00, cerca de 1 hora. Quer marcar?'],
    ]),
    conv(9, 60 * 26, [
      ['in', 'Oi, quero marcar extensão'],
      ['out', 'Qual dia fica melhor para Extensão de cílios (demo)?'],
      ['in', 'Amanhã'],
      ['out', 'Pronto! Seu horário está marcado. Para remarcar ou cancelar, escreva "menu".'],
      ['in', 'Obrigada!'],
    ]),
    conv(
      7,
      60 * 30,
      [
        ['in', 'Oi, não consegui ir ontem, desculpa'],
        ['out', 'Como posso ajudar? Escolha uma opção.'],
        ['in', 'Falar com a Ana'],
        ['out', 'Certo! Já avisei a Ana. Ela responde por aqui assim que puder.'],
      ],
      true,
    ),
    conv(0, 60 * 48, [
      ['out', 'Oi! Passando para lembrar do seu horário amanhã às 10:00. Você confirma?'],
      ['in', 'Confirmar'],
      ['out', 'Obrigada! Seu horário está confirmado.'],
    ]),
    conv(5, 60 * 72, [
      ['in', 'Quero remarcar'],
      ['out', 'Seus horários: Manutenção de cílios (demo). Escolha o que quer fazer.'],
      ['in', 'Remarcar'],
      ['out', 'Pronto! Horário remarcado.'],
    ]),
    conv(
      6,
      60 * 24 * 12,
      [
        ['in', 'Preciso cancelar meu horário'],
        ['out', 'Pronto, seu horário foi cancelado. Quando quiser marcar de novo, é só chamar.'],
      ],
      false,
      true,
    ),
  ];
  for (const c of conversations.filter((x) => x.botPausedAt)) {
    events.push({
      id: id('ev'),
      type: 'handoff.requested',
      actorType: 'contact',
      createdAt: c.botPausedAt!,
      contactId: c.contactId,
    });
  }

  const tasks = [
    {
      id: 'demo-t-1',
      title: 'Chamar de volta: faltou ao horário',
      dueAt: iso(at(0, 1080)),
      contactId: contacts[7]!.id,
      doneAt: null,
    },
    {
      id: 'demo-t-2',
      title: 'Oferecer o próximo horário',
      dueAt: iso(at(1, 600)),
      contactId: contacts[1]!.id,
      doneAt: null,
    },
  ];

  const tickets: DemoTicket[] = [
    {
      id: 'demo-tk-1',
      topic: 'duvida',
      subject: 'Como mudo o texto do lembrete?',
      status: 'CLOSED',
      ownerUnread: false,
      createdAt: iso(at(-9, 800)),
      updatedAt: iso(at(-9, 860)),
      description: 'Queria deixar a mensagem do lembrete com o meu jeito de falar.',
      messages: [
        {
          id: 'demo-tkm-1',
          authorType: 'owner',
          authorName: 'Ana (demo)',
          body: 'Queria deixar a mensagem do lembrete com o meu jeito de falar.',
          createdAt: iso(at(-9, 800)),
        },
        {
          id: 'demo-tkm-2',
          authorType: 'nexo',
          authorName: 'Equipe nexo',
          body: 'Oi, Ana! Fica em Configurações > Mensagens do robô. Mudou, salvou, já vale. (resposta de exemplo)',
          createdAt: iso(at(-9, 850)),
        },
      ],
    },
  ];

  return {
    business: {
      name: 'Estúdio Exemplo (demo)',
      attendantName: 'a Ana',
      timezone: TZ,
      slotStepMinutes: 30,
      minNoticeMinutes: 60,
    },
    ownerName: 'Ana (demo)',
    services,
    professionals: [owner],
    faq: [
      {
        question: 'Onde fica o estúdio?',
        answer: 'Rua de Exemplo, 123 (endereço fictício da demonstração).',
      },
      {
        question: 'Quanto tempo dura a extensão?',
        answer: 'Cerca de 1h30. A manutenção, cerca de 1 hora.',
      },
    ],
    stages,
    rules: [
      { event: 'contact.created', defaultStageId: 'demo-st-new' },
      { event: 'faq.viewed', defaultStageId: 'demo-st-info' },
      { event: 'appointment.created', defaultStageId: 'demo-st-sched' },
      { event: 'appointment.confirmed', defaultStageId: null },
      { event: 'appointment.done', defaultStageId: 'demo-st-done' },
      { event: 'appointment.returned', defaultStageId: 'demo-st-back' },
      { event: 'appointment.no_show', defaultStageId: null },
      { event: 'appointment.cancelled', defaultStageId: null },
      { event: 'handoff.requested', defaultStageId: null },
      { event: 'contact.opted_out', defaultStageId: null },
    ],
    contacts,
    deals,
    appointments,
    conversations,
    tasks,
    events,
    timeOff: [
      {
        id: 'demo-off-1',
        startsAt: iso(localAt(addDays(today, 10), 0)),
        endsAt: iso(localAt(addDays(today, 11), 0)),
        reason: 'Curso (exemplo)',
        professionalId: null,
      },
    ],
    tickets,
    goals: { doneCount: 40, revenueCents: 600_000 },
    alerts: { notifyEmail: false, nextVisitDays: 10, emailAvailable: false },
    messages: (botMessages as { messages: { key: string }[] }).messages.map((m) => ({
      key: m.key,
      custom: null,
    })),
    seq,
  };
}

export { botMessages };
