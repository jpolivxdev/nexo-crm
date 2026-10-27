import { beforeEach, describe, expect, it } from 'vitest';
import { zonedToUtc } from '../scheduling/timezone.js';
import {
  type AppointmentSummary,
  type BotContext,
  type BotInput,
  type BotPorts,
  type BotResult,
  type BotState,
  handle,
} from './machine.js';
import type { OutgoingMessage } from './outgoing.js';

const TZ = 'America/Sao_Paulo';
// Domingo, 01/11/2026, 21h em São Paulo.
const NOW = new Date('2026-11-02T00:00:00Z');

const ctx = (over: Partial<BotContext> = {}): BotContext => ({
  businessName: 'Estúdio Exemplo (demo)',
  ownerName: 'Ana',
  timeZone: TZ,
  now: NOW,
  isFirstContact: false,
  ownerAvailableNow: true,
  ...over,
});

/** Agenda falsa em memória: terça e quarta com horários das 9h às 11h. */
class FakePorts implements BotPorts {
  services = [
    { id: 's1', name: 'Aplicação de cílios', durationMinutes: 60 },
    { id: 's2', name: 'Manutenção', durationMinutes: 60 },
  ];
  professionals = [{ id: 'p1', name: 'Ana' }];
  dates = ['2026-11-03', '2026-11-04'];
  taken = new Set<string>();
  booked: { serviceId: string; professionalId?: string; startsAt: Date }[] = [];
  appointments: AppointmentSummary[] = [];
  cancelled: string[] = [];
  rescheduled: { appointmentId: string; startsAt: Date }[] = [];
  takeOnBook = false;

  listServices = async () => this.services;
  listProfessionals = async () => this.professionals;
  listDates = async () => this.dates;
  listSlots = async ({ date }: { date: string }) =>
    [540, 600, 660]
      .map((m) => zonedToUtc(date, m, TZ))
      .filter((d) => !this.taken.has(d.toISOString()));
  book = async (q: { serviceId: string; professionalId?: string; startsAt: Date }) => {
    if (this.takeOnBook) return { ok: false as const, reason: 'slot_taken' as const };
    this.booked.push(q);
    return { ok: true as const };
  };
  upcoming = async () => this.appointments;
  reschedule = async (q: { appointmentId: string; startsAt: Date }) => {
    this.rescheduled.push(q);
    return { ok: true as const };
  };
  cancel = async (id: string) => {
    this.cancelled.push(id);
  };
}

const say = (t: string): BotInput => ({ kind: 'text', text: t });
const tap = (id: string): BotInput => ({ kind: 'choice', id });

function ids(msg: OutgoingMessage | undefined): string[] {
  if (!msg) return [];
  if (msg.type === 'buttons') return msg.buttons.map((b) => b.id);
  if (msg.type === 'list') return msg.rows.map((r) => r.id);
  return [];
}
function bodies(r: BotResult): string[] {
  return r.replies.map((m) => m.body);
}
const last = (r: BotResult) => r.replies.at(-1);

describe('robô: máquina de estados', () => {
  let ports: FakePorts;
  let state: BotState | null;

  beforeEach(() => {
    ports = new FakePorts();
    state = null;
  });

  async function send(input: BotInput, over: Partial<BotContext> = {}) {
    const r = await handle(state, input, ctx(over), ports);
    state = r.state;
    return r;
  }

  it('primeiro contato: aviso de privacidade e menu', async () => {
    const r = await send(say('oi'), { isFirstContact: true });
    expect(bodies(r)[0]).toContain('atendimento automático do Estúdio Exemplo (demo)');
    expect(r.actions).toEqual([{ type: 'privacy_notice_shown' }]);
    expect(ids(last(r))).toEqual(['menu:book', 'menu:mine', 'menu:human']);
    expect(state?.step).toBe('menu');
  });

  it('qualquer texto na primeira mensagem abre o menu', async () => {
    const r = await send(say('boa noite, tudo bem?'));
    expect(state?.step).toBe('menu');
    expect(bodies(r)).not.toContain('Não entendi. Escolha uma das opções abaixo.');
  });

  it('mostra "Dúvidas" no menu só quando há dúvidas cadastradas', async () => {
    const r = await send(say('menu'), {
      faq: [{ question: 'Endereço?', answer: 'Rua Exemplo, 1' }],
    });
    expect(ids(last(r))).toEqual(['menu:book', 'menu:mine', 'menu:faq', 'menu:human']);
    expect(last(r)?.type).toBe('list');
  });

  it('caminho completo: serviço → dia → horário → confirmar', async () => {
    await send(say('oi'));
    let r = await send(tap('menu:book'));
    expect(ids(last(r))).toEqual(['svc:s1', 'svc:s2']);

    r = await send(tap('svc:s1'));
    expect(state?.step).toBe('date');
    expect(ids(last(r))).toEqual(['date:2026-11-03', 'date:2026-11-04']);
    expect(last(r)?.type === 'buttons' && last(r)).toBeTruthy();

    r = await send(tap('date:2026-11-03'));
    expect(state?.step).toBe('time');
    expect(last(r)?.body).toContain('terça, 03/11');
    const nineAm = '2026-11-03T12:00:00.000Z';
    expect(ids(last(r))[0]).toBe(`time:${nineAm}`);

    r = await send(tap(`time:${nineAm}`));
    expect(last(r)?.body).toBe('Confirma Aplicação de cílios em terça, 03/11 às 09:00?');

    r = await send(tap('confirm:yes'));
    expect(ports.booked).toEqual([
      { serviceId: 's1', professionalId: undefined, startsAt: new Date(nineAm) },
    ]);
    expect(bodies(r)[0]).toBe(
      'Pronto! Seu horário está marcado: Aplicação de cílios, terça, 03/11 às 09:00. Para remarcar ou cancelar, escreva "menu".',
    );
    expect(state?.step).toBe('start');
  });

  it('com um serviço só, pula direto para os dias', async () => {
    ports.services = [ports.services[0]!];
    await send(say('oi'));
    await send(tap('menu:book'));
    expect(state?.step).toBe('date');
  });

  it('com mais de uma profissional, pergunta com quem (com opção "Tanto faz")', async () => {
    ports.professionals = [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Bia' },
    ];
    await send(say('oi'));
    await send(tap('menu:book'));
    const r = await send(tap('svc:s1'));
    expect(ids(last(r))).toEqual(['pro:any', 'pro:p1', 'pro:p2']);
    await send(tap('pro:p2'));
    expect(state).toMatchObject({ step: 'date', professionalId: 'p2' });
  });

  it('horário ocupado na hora de confirmar: avisa e mostra os horários de novo', async () => {
    await send(say('oi'));
    await send(tap('menu:book'));
    await send(tap('svc:s1'));
    await send(tap('date:2026-11-03'));
    await send(tap('time:2026-11-03T12:00:00.000Z'));
    ports.takeOnBook = true;
    const r = await send(tap('confirm:yes'));
    expect(bodies(r)[0]).toBe('Puxa, esse horário acabou de ser ocupado. Escolha outro.');
    expect(state?.step).toBe('time');
  });

  it('"outro horário" na confirmação volta para os dias', async () => {
    await send(say('oi'));
    await send(tap('menu:book'));
    await send(tap('svc:s1'));
    await send(tap('date:2026-11-03'));
    await send(tap('time:2026-11-03T12:00:00.000Z'));
    await send(tap('confirm:other'));
    expect(state?.step).toBe('date');
  });

  it('sem dias livres: oferece falar com a equipe', async () => {
    ports.dates = [];
    ports.services = [ports.services[0]!];
    await send(say('oi'));
    const r = await send(tap('menu:book'));
    expect(ids(last(r))).toContain('menu:human');
  });

  it('pagina listas com mais de 10 dias', async () => {
    ports.dates = Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 3).padStart(2, '0')}`);
    ports.services = [ports.services[0]!];
    await send(say('oi'));
    let r = await send(tap('menu:book'));
    expect(ids(last(r))).toHaveLength(10);
    expect(ids(last(r)).at(-1)).toBe('more:1');
    r = await send(tap('more:1'));
    expect(ids(last(r))).toEqual(['date:2026-11-12', 'date:2026-11-13', 'date:2026-11-14']);
  });

  it('meus horários → remarcar', async () => {
    ports.appointments = [
      {
        id: 'a1',
        serviceId: 's1',
        serviceName: 'Aplicação de cílios',
        startsAt: new Date('2026-11-03T12:00:00Z'),
      },
    ];
    await send(say('oi'));
    let r = await send(tap('menu:mine'));
    expect(ids(last(r))).toEqual(['appt:a1']);
    r = await send(tap('appt:a1'));
    expect(ids(last(r))).toEqual(['manage:reschedule', 'manage:cancel', 'manage:back']);
    await send(tap('manage:reschedule'));
    expect(state).toMatchObject({ step: 'date', flow: 'reschedule', appointmentId: 'a1' });
    await send(tap('date:2026-11-04'));
    await send(tap('time:2026-11-04T13:00:00.000Z'));
    r = await send(tap('confirm:yes'));
    expect(ports.rescheduled).toEqual([
      { appointmentId: 'a1', startsAt: new Date('2026-11-04T13:00:00.000Z') },
    ]);
    expect(bodies(r)[0]).toBe('Pronto! Seu horário foi remarcado para quarta, 04/11 às 10:00.');
  });

  it('"cancelar" em qualquer momento abre os horários e pede confirmação', async () => {
    ports.appointments = [
      {
        id: 'a1',
        serviceId: 's1',
        serviceName: 'Manutenção',
        startsAt: new Date('2026-11-03T12:00:00Z'),
      },
    ];
    await send(say('oi'));
    await send(tap('menu:book'));
    await send(say('cancelar'));
    expect(state?.step).toBe('mine');
    await send(tap('appt:a1'));
    let r = await send(tap('manage:cancel'));
    expect(last(r)?.body).toBe('Cancelar Manutenção em terça, 03/11 às 09:00?');
    r = await send(tap('cancel:yes'));
    expect(ports.cancelled).toEqual(['a1']);
    expect(bodies(r)[0]).toContain('Horário cancelado');
  });

  it('desistir do cancelamento volta ao menu sem cancelar', async () => {
    ports.appointments = [
      {
        id: 'a1',
        serviceId: 's1',
        serviceName: 'Manutenção',
        startsAt: new Date('2026-11-03T12:00:00Z'),
      },
    ];
    await send(say('cancelar'));
    await send(tap('appt:a1'));
    await send(tap('manage:cancel'));
    await send(tap('cancel:no'));
    expect(ports.cancelled).toEqual([]);
    expect(state?.step).toBe('menu');
  });

  it('sem horários marcados: oferece marcar', async () => {
    const r = await send(say('cancelar'));
    expect(ids(last(r))).toEqual(['menu:book', 'menu:back']);
  });

  it('dúvidas frequentes respondem e voltam ao menu', async () => {
    const faq = [{ question: 'Qual o endereço?', answer: 'Rua Exemplo, 100 (demo).' }];
    await send(say('oi'), { faq });
    await send(tap('menu:faq'), { faq });
    const r = await send(tap('faq:0'), { faq });
    expect(bodies(r)[0]).toBe('Rua Exemplo, 100 (demo).');
    expect(state?.step).toBe('menu');
  });

  it('falar com a equipe: pausa e avisa (dentro e fora do horário)', async () => {
    await send(say('oi'));
    let r = await send(tap('menu:human'));
    expect(r.actions).toEqual([{ type: 'handoff' }]);
    expect(bodies(r)[0]).toBe('Certo! Avisei Ana, que vai continuar a conversa por aqui.');
    expect(state?.step).toBe('handoff');

    state = null;
    r = await send(say('atendente'), { ownerAvailableNow: false });
    expect(bodies(r)[0]).toContain('fora do horário de atendimento');
  });

  it('"parar" desliga as mensagens; só "oi" religa', async () => {
    await send(say('oi'));
    let r = await send(say('Parar'));
    expect(r.actions).toEqual([{ type: 'opt_out' }]);
    expect(state?.step).toBe('opted_out');

    r = await send(say('quero marcar'));
    expect(r.replies).toEqual([]);

    r = await send(tap('menu:book'));
    expect(r.replies).toEqual([]);

    r = await send(say('oi'));
    expect(r.actions).toEqual([{ type: 'opt_in' }]);
    expect(state?.step).toBe('menu');
  });

  it('"parar" na primeira mensagem não mostra aviso de privacidade', async () => {
    const r = await send(say('parar'), { isFirstContact: true });
    expect(r.actions).toEqual([{ type: 'opt_out' }]);
  });

  it('texto livre no meio do fluxo: avisa que não entendeu e repete a pergunta', async () => {
    await send(say('oi'));
    await send(tap('menu:book'));
    const r = await send(say('quero o mais barato'));
    expect(bodies(r)[0]).toBe('Não entendi. Escolha uma das opções abaixo.');
    expect(ids(last(r))).toEqual(['svc:s1', 'svc:s2']);
    expect(state?.step).toBe('service');
  });

  it('toque em opção de outra tela (ou inventada) é tratado como não entendido', async () => {
    await send(say('oi'));
    await send(tap('menu:book'));
    const r = await send(tap('date:2026-11-03'));
    expect(bodies(r)[0]).toBe('Não entendi. Escolha uma das opções abaixo.');
    expect(state?.step).toBe('service');
    await send(tap('svc:nao-existe'));
    expect(state?.step).toBe('service');
    await send(tap('time:isso-nao-e-data'));
    expect(state?.step).toBe('service');
  });

  it('mensagens editadas pelo dono substituem as padrão', async () => {
    const r = await send(say('oi'), { messages: { menu: 'Oi, flor! O que você precisa?' } });
    expect(last(r)?.body).toBe('Oi, flor! O que você precisa?');
  });

  it('nenhuma mensagem quebra os limites do WhatsApp', async () => {
    ports.services = Array.from({ length: 15 }, (_, i) => ({
      id: `s${i}`,
      name: `Serviço com um nome bem comprido número ${i}`,
      durationMinutes: 60,
    }));
    await send(say('oi'));
    const r = await send(tap('menu:book'));
    const msg = last(r);
    if (msg?.type !== 'list') throw new Error('esperava lista');
    expect(msg.rows.length).toBeLessThanOrEqual(10);
    for (const row of msg.rows) expect([...row.title].length).toBeLessThanOrEqual(24);
  });
});
