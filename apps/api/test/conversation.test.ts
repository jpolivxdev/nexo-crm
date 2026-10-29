import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { BotInput, OutgoingMessage } from '@nexo/core';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../src/channel/channel.registry.js';
import type { InboundMessage } from '../src/channel/channel.types.js';
import { SimulatorChannel } from '../src/channel/simulator.channel.js';
import { ConversationService } from '../src/conversation/conversation.service.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { RealtimeBus, type RealtimeNotice } from '../src/realtime/realtime.bus.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL, MIGRATION_URL } from './support/app.js';
import { metaWebhook, sign, textMessage } from './support/meta.js';

const prisma = createPrismaClient(DATABASE_URL);
// Segunda, 06/01/2031, 12h em São Paulo (dentro do expediente? não: seed atende de terça a sábado).
const NOW = new Date('2031-01-06T15:00:00Z');

describe('conversa: robô + CRM de ponta a ponta', () => {
  let app: INestApplication;
  let conversations: ConversationService;
  let t: DemoTenant;
  let sim: string;
  let phone: string;
  let sent: OutgoingMessage[];
  let notices: RealtimeNotice[];
  let unsubscribe: () => void;
  let seq = 0;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
    conversations = app.get(ConversationService);
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
    sent = [];
    notices = [];
    sim = `sim-${randomInt(1e9)}`;
    phone = `55000${randomInt(1e7, 9e7)}`;
    app.get(ChannelRegistry).registerSimulator(sim, new SimulatorChannel((_to, m) => sent.push(m)));
    unsubscribe?.();
    unsubscribe = app.get(RealtimeBus).subscribe(t.tenantId, (n) => notices.push(n));
  });

  afterAll(async () => {
    unsubscribe?.();
    await app?.close();
    await prisma.$disconnect();
  });

  const msg = (input: BotInput, externalId?: string): InboundMessage => {
    seq += 1;
    return {
      channel: 'simulator',
      businessExternalId: sim,
      externalId: externalId ?? `sim-in-${Date.now()}-${seq}`,
      from: phone,
      profileName: 'Cliente Teste',
      type: input.kind === 'text' ? 'text' : 'interactive',
      input,
      body: input.kind === 'text' ? input.text : input.id,
      receivedAt: NOW.toISOString(),
    };
  };
  const say = (text: string, id?: string) =>
    conversations.handleInbound(t.tenantId, msg({ kind: 'text', text }, id), NOW);
  const tap = (id: string) =>
    conversations.handleInbound(t.tenantId, msg({ kind: 'choice', id }), NOW);

  const db = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(prisma, t.tenantId, fn);
  const contact = () =>
    db((tx) =>
      tx.contact.findUniqueOrThrow({
        where: { tenantId_phone: { tenantId: t.tenantId, phone } },
        include: { deals: { include: { stage: true } }, consents: true },
      }),
    );

  it('primeira mensagem cria a cliente, o atendimento, o aviso de privacidade e responde', async () => {
    await say('oi');
    const c = await contact();
    expect(c.name).toBe('Cliente Teste');
    expect(c.deals.map((d) => d.stage.key)).toEqual(['new']);
    expect(c.consents.map((x) => x.kind)).toEqual(['PRIVACY_NOTICE_SHOWN']);

    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent.at(-1)?.type).not.toBe('text'); // menu com opções

    const history = await db((tx) =>
      tx.message.findMany({
        orderBy: { createdAt: 'asc' },
        where: { conversation: { contactId: c.id } },
      }),
    );
    expect(history[0]).toMatchObject({ direction: 'INBOUND', body: 'oi', status: 'processed' });
    expect(
      history.filter((m) => m.direction === 'OUTBOUND').every((m) => m.status === 'sent'),
    ).toBe(true);
    expect(notices).toContainEqual(expect.objectContaining({ type: 'conversation.updated' }));

    // Segunda mensagem: sem aviso de novo.
    sent = [];
    await say('oi');
    expect((await contact()).consents).toHaveLength(1);
  });

  it('a mesma mensagem (mesmo wamid) não é respondida duas vezes', async () => {
    await say('oi', `dup-${phone}`);
    const first = sent.length;
    await say('oi', `dup-${phone}`);
    expect(sent.length).toBe(first);
    const inbound = await db((tx) => tx.message.count({ where: { externalId: `dup-${phone}` } }));
    expect(inbound).toBe(1);
  });

  it('marca horário pela conversa e a cliente vai para "Agendou"', async () => {
    await say('oi');
    await tap('menu:book');
    await tap(`svc:${t.serviceIds[0]}`);
    await tap('date:2031-01-07');
    await tap('time:2031-01-07T12:00:00.000Z');
    sent = [];
    await tap('confirm:yes');
    expect(sent[0]?.body).toContain('Pronto! Seu horário está marcado');

    const c = await contact();
    expect(c.deals[0]?.stage.key).toBe('scheduled');
    expect(notices).toContainEqual(expect.objectContaining({ type: 'agenda.changed' }));
  });

  it('dúvida frequente leva para "Pediu informação"', async () => {
    await db((tx) =>
      tx.tenant.update({
        where: { id: t.tenantId },
        data: { faq: [{ question: 'Endereço?', answer: 'Rua Exemplo, 100 (demo).' }] },
      }),
    );
    await say('oi');
    await tap('menu:faq');
    sent = [];
    await tap('faq:0');
    expect(sent[0]?.body).toBe('Rua Exemplo, 100 (demo).');
    expect((await contact()).deals[0]?.stage.key).toBe('asked_info');
  });

  it('falar com a equipe pausa o robô, cria "A fazer" e avisa o painel; a dona devolve', async () => {
    await say('oi');
    await tap('menu:human');
    const c = await contact();
    const conversation = await db((tx) =>
      tx.conversation.findFirstOrThrow({ where: { contactId: c.id } }),
    );
    expect(conversation.botPausedAt).not.toBeNull();
    const tasks = await db((tx) => tx.task.findMany({ where: { contactId: c.id } }));
    expect(tasks.map((x) => x.title)).toEqual(['Responder Cliente Teste no WhatsApp']);
    expect(notices).toContainEqual({ type: 'handoff.requested', id: conversation.id });

    sent = [];
    await say('alguém aí?');
    expect(sent).toEqual([]);
    const saved = await db((tx) =>
      tx.message.findFirst({ where: { conversationId: conversation.id, body: 'alguém aí?' } }),
    );
    expect(saved?.status).toBe('processed');

    await conversations.resumeBot(t.tenantId, conversation.id, { type: 'user' });
    await say('oi');
    expect(sent.length).toBeGreaterThan(0);
  });

  it('"parar" registra a recusa e o robô para; "oi" volta a receber', async () => {
    await say('oi');
    await say('parar');
    let c = await contact();
    expect(c.optedOutAt).not.toBeNull();
    expect(c.consents.map((x) => x.kind).sort()).toEqual(['OPT_OUT', 'PRIVACY_NOTICE_SHOWN']);

    sent = [];
    await say('quero marcar');
    expect(sent).toEqual([]);

    await say('oi');
    c = await contact();
    expect(c.optedOutAt).toBeNull();
    expect(c.consents.map((x) => x.kind)).toContain('OPT_IN');
    expect(sent.length).toBeGreaterThan(0);
  });

  it('falha no envio fica marcada na mensagem, sem perder o resto', async () => {
    app.get(ChannelRegistry).registerSimulator(sim, {
      name: 'simulator',
      send: () => Promise.reject(new Error('fora do ar')),
    });
    await say('oi');
    const statuses = await db((tx) =>
      tx.message.findMany({
        where: { direction: 'OUTBOUND', conversation: { contact: { phone } } },
      }),
    );
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((m) => m.status === 'failed')).toBe(true);
  });
});

describe('webhook → fila → robô (fluxo completo)', () => {
  it('mensagem assinada da Meta vira cliente, histórico e resposta guardada', async () => {
    const { app } = await createTestApp({ RUN_WORKER: 'true' });
    const admin = new pg.Client({ connectionString: MIGRATION_URL });
    await admin.connect();
    try {
      const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
      const phoneNumberId = String(randomInt(1e9, 9e9));
      await admin.query(
        `INSERT INTO channel_routes (channel, external_id, tenant_id) VALUES ('whatsapp', $1, $2)`,
        [phoneNumberId, t.tenantId],
      );
      const raw = JSON.stringify(metaWebhook(phoneNumberId, [textMessage('oi', '5500911112222')]));
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw);
      expect(res.status).toBe(200);

      const messages = await withTenant(prisma, t.tenantId, (tx) =>
        tx.message.findMany({ where: { conversation: { contact: { phone: '5500911112222' } } } }),
      );
      expect(messages.find((m) => m.direction === 'INBOUND')?.status).toBe('processed');
      // Sem token da Meta no teste: a resposta fica só no histórico.
      const outbound = messages.filter((m) => m.direction === 'OUTBOUND');
      expect(outbound.length).toBeGreaterThan(0);
      expect(outbound.every((m) => m.status === 'not_sent')).toBe(true);
    } finally {
      await admin.end();
      await app.close();
    }
  });
});
