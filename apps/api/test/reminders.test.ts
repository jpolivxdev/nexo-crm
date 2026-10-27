import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { BotInput, OutgoingMessage } from '@nexo/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../src/channel/channel.registry.js';
import { SimulatorChannel } from '../src/channel/simulator.channel.js';
import { ConversationService } from '../src/conversation/conversation.service.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { ReminderService } from '../src/reminders/reminder.service.js';
import { SchedulingService } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
// Segunda, 06/01/2031, 12h em São Paulo. O horário marcado fica na quarta, 08/01.
const NOW = new Date('2031-01-06T15:00:00Z');
const H = 60 * 60 * 1000;

describe('lembretes de horário (relógio simulado)', () => {
  let app: INestApplication;
  let reminders: ReminderService;
  let scheduling: SchedulingService;
  let conversations: ConversationService;
  let t: DemoTenant;
  let phone: string;
  let sent: { to: string; message: OutgoingMessage }[];
  let seq = 0;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
    reminders = app.get(ReminderService);
    scheduling = app.get(SchedulingService);
    conversations = app.get(ConversationService);
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
    phone = `55000${randomInt(1e7, 9e7)}`;
    sent = [];
    // Conversas do simulador respondem pelo número "terminal" (mesma regra da resposta pelo painel).
    const channel = new SimulatorChannel((to, message) => sent.push({ to, message }));
    app.get(ChannelRegistry).registerSimulator('terminal', channel);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const db = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(prisma, t.tenantId, fn);
  const run = (at: Date) => reminders.runDue(at, { tenantIds: [t.tenantId] });

  const inbound = (input: BotInput, at = NOW) => {
    seq += 1;
    return conversations.handleInbound(
      t.tenantId,
      {
        channel: 'simulator',
        businessExternalId: 'terminal',
        externalId: `rem-${Date.now()}-${seq}`,
        from: phone,
        profileName: 'Cliente Teste',
        type: input.kind === 'text' ? 'text' : 'interactive',
        input,
        body: input.kind === 'text' ? input.text : input.id,
        receivedAt: at.toISOString(),
      },
      at,
    );
  };

  /** Cliente que já conversou pelo simulador, com horário marcado na quarta. */
  async function bookForSimulatorContact() {
    await inbound({ kind: 'text', text: 'oi' });
    const contact = await db((tx) =>
      tx.contact.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: t.tenantId, phone } } }),
    );
    const [slot] = await scheduling.listSlots(t.tenantId, {
      serviceId: t.serviceIds[0]!,
      date: '2031-01-08',
      now: NOW,
    });
    const appt = await scheduling.book(t.tenantId, {
      contactId: contact.id,
      serviceId: t.serviceIds[0]!,
      startsAt: slot!.startsAt,
      source: 'WHATSAPP',
      actor: { type: 'contact', id: contact.id },
      now: NOW,
    });
    sent = [];
    return { contact, appt };
  }

  /** Ordem do enum no banco: primeiro o de 24 h, depois o de 1 h. */
  const remindersOf = (appointmentId: string) =>
    db((tx) => tx.reminder.findMany({ where: { appointmentId }, orderBy: { kind: 'asc' } }));

  it('marcar cria os lembretes de 24 h e 1 h antes', async () => {
    const { appt } = await bookForSimulatorContact();
    const list = await remindersOf(appt.id);
    expect(list.map((r) => [r.kind, r.status, r.sendAt.getTime()])).toEqual([
      ['BEFORE_24H', 'PENDING', appt.startsAt.getTime() - 24 * H],
      ['BEFORE_1H', 'PENDING', appt.startsAt.getTime() - H],
    ]);
  });

  it('na hora certa manda uma vez só, com botões, e grava no histórico', async () => {
    const { appt } = await bookForSimulatorContact();
    const at24 = new Date(appt.startsAt.getTime() - 24 * H);

    expect((await run(new Date(at24.getTime() - 60_000))).sent).toBe(0);
    expect((await run(at24)).sent).toBe(1);
    expect((await run(new Date(at24.getTime() + 60_000))).sent).toBe(0);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(phone);
    const msg = sent[0]!.message;
    expect(msg.type).toBe('buttons');
    expect(msg.type === 'buttons' && msg.buttons.map((b) => b.id)).toEqual([
      `rem:confirm:${appt.id}`,
      `rem:reschedule:${appt.id}`,
      `rem:cancel:${appt.id}`,
    ]);
    const history = await db((tx) =>
      tx.message.findMany({ where: { direction: 'OUTBOUND', createdAt: at24 } }),
    );
    expect(history.map((m) => m.body)).toEqual([msg.body]);
    const [r24] = await remindersOf(appt.id);
    expect(r24!.status).toBe('SENT');
  });

  it('a cliente toca em Confirmar e o horário fica confirmado', async () => {
    const { appt } = await bookForSimulatorContact();
    const at24 = new Date(appt.startsAt.getTime() - 24 * H);
    await run(at24);
    await inbound({ kind: 'choice', id: `rem:confirm:${appt.id}` }, at24);
    const after = await db((tx) => tx.appointment.findUniqueOrThrow({ where: { id: appt.id } }));
    expect(after.status).toBe('CONFIRMED');
    expect(sent.at(-1)?.message.body).toMatch(/^Combinado!/);
    // Confirmado ainda recebe o de 1 hora.
    const [, r1h] = await remindersOf(appt.id);
    expect(r1h!.status).toBe('PENDING');
  });

  it('cancelar o horário cancela os lembretes; remarcar reagenda', async () => {
    const { contact, appt } = await bookForSimulatorContact();
    const [, other] = await scheduling.listSlots(t.tenantId, {
      serviceId: t.serviceIds[0]!,
      date: '2031-01-09',
      now: NOW,
    });
    const moved = await scheduling.reschedule(t.tenantId, appt.id, {
      startsAt: other!.startsAt,
      actor: { type: 'contact', id: contact.id },
      now: NOW,
    });
    expect((await remindersOf(appt.id)).map((r) => r.sendAt.getTime())).toEqual([
      moved.startsAt.getTime() - 24 * H,
      moved.startsAt.getTime() - H,
    ]);

    await scheduling.setStatus(t.tenantId, appt.id, 'CANCELLED', { type: 'user' });
    expect((await remindersOf(appt.id)).map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect((await run(new Date(moved.startsAt.getTime() - H))).sent).toBe(0);
    expect(sent).toEqual([]);
  });

  it('quem pediu "parar" não recebe lembrete', async () => {
    const { appt } = await bookForSimulatorContact();
    await inbound({ kind: 'text', text: 'parar' });
    sent = [];
    const result = await run(new Date(appt.startsAt.getTime() - 24 * H));
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toEqual([]);
  });

  it('WhatsApp sem conversa nas últimas 24 h: não manda texto livre, espera mensagem de modelo', async () => {
    // Cliente cadastrada pelo painel, sem conversa: o canal é o WhatsApp.
    const contactId = t.contactIds[0]!;
    const [slot] = await scheduling.listSlots(t.tenantId, {
      serviceId: t.serviceIds[0]!,
      date: '2031-01-10',
      now: NOW,
    });
    const appt = await scheduling.book(t.tenantId, {
      contactId,
      serviceId: t.serviceIds[0]!,
      startsAt: slot!.startsAt,
      source: 'PANEL',
      actor: { type: 'user' },
      now: NOW,
    });
    const result = await run(new Date(appt.startsAt.getTime() - 24 * H));
    expect(result.needs_template).toBe(1);
    expect(sent).toEqual([]);
    const [r24] = await remindersOf(appt.id);
    expect(r24!.status).toBe('FAILED');
    const events = await db((tx) =>
      tx.event.findMany({ where: { entityId: appt.id, type: 'reminder.failed' } }),
    );
    expect(events).toHaveLength(1);
  });
});
