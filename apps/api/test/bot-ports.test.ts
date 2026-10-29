import { handleBotMessage, type BotContext, type BotState } from '@nexo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBotPorts } from '../src/bot/bot-ports.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { SchedulingService } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nexo_app:nexo_app@localhost:5432/nexo';
const prisma = createPrismaClient(DATABASE_URL);
const db = {
  withTenant: <T>(id: string, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(prisma, id, fn),
};
const scheduling = new SchedulingService(db);

// Segunda, 06/01/2031, 12h em São Paulo.
const NOW = new Date('2031-01-06T15:00:00Z');

describe('robô ligado à agenda real', () => {
  let t: DemoTenant;
  let other: DemoTenant;

  beforeAll(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
    other = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const ctx: BotContext = {
    businessName: 'Estúdio Exemplo (demo)',
    ownerName: 'Ana',
    timeZone: 'America/Sao_Paulo',
    now: NOW,
    isFirstContact: false,
    ownerAvailableNow: true,
  };

  it('marca um horário de ponta a ponta pela conversa', async () => {
    const ports = createBotPorts({
      db,
      scheduling,
      tenantId: t.tenantId,
      contactId: t.contactIds[1]!,
      now: () => NOW,
    });
    let state: BotState | null = null;
    const step = async (input: Parameters<typeof handleBotMessage>[1]) => {
      const r = await handleBotMessage(state, input, ctx, ports);
      state = r.state;
      return r;
    };

    await step({ kind: 'text', text: 'oi' });
    let r = await step({ kind: 'choice', id: 'menu:book' });
    const services = r.replies.at(-1);
    // Nomes do seed passam de 20 caracteres, então viram lista em vez de botões.
    expect(services?.type).toBe('list');

    const serviceId = t.serviceIds[0]!;
    r = await step({ kind: 'choice', id: `svc:${serviceId}` });
    // Seed: terça a sábado. A primeira data livre é terça, 07/01.
    expect(r.replies.at(-1)?.type === 'list' || r.replies.at(-1)?.type === 'buttons').toBe(true);
    await step({ kind: 'choice', id: 'date:2031-01-07' });
    await step({ kind: 'choice', id: 'time:2031-01-07T12:00:00.000Z' });
    r = await step({ kind: 'choice', id: 'confirm:yes' });
    expect(r.replies[0]?.body).toContain('Pronto! Seu horário está marcado');

    const appts = await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.findMany({ where: { contactId: t.contactIds[1]! } }),
    );
    expect(appts.map((a) => a.startsAt.toISOString())).toEqual(['2031-01-07T12:00:00.000Z']);
  });

  it('não deixa uma cliente cancelar ou remarcar horário de outra', async () => {
    const owner = createBotPorts({
      db,
      scheduling,
      tenantId: t.tenantId,
      contactId: t.contactIds[2]!,
      now: () => NOW,
    });
    await owner.book({ serviceId: t.serviceIds[0]!, startsAt: new Date('2031-01-08T13:00:00Z') });
    const [appt] = await owner.upcoming();

    const intruder = createBotPorts({
      db,
      scheduling,
      tenantId: t.tenantId,
      contactId: t.contactIds[0]!,
      now: () => NOW,
    });
    await intruder.cancel(appt!.id);
    expect(
      await intruder.reschedule({
        appointmentId: appt!.id,
        startsAt: new Date('2031-01-08T17:00:00Z'),
      }),
    ).toEqual({ ok: false, reason: 'slot_taken' });
    expect((await owner.upcoming())[0]?.startsAt).toEqual(new Date('2031-01-08T13:00:00Z'));
  });

  it('não enxerga serviços de outro negócio', async () => {
    const ports = createBotPorts({
      db,
      scheduling,
      tenantId: t.tenantId,
      contactId: t.contactIds[0]!,
      now: () => NOW,
    });
    const ids = (await ports.listServices()).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(t.serviceIds));
    expect(ids.some((id) => other.serviceIds.includes(id))).toBe(false);
  });

  it('lista só dias com horário livre (terça a sábado no seed)', async () => {
    const ports = createBotPorts({
      db,
      scheduling,
      tenantId: t.tenantId,
      contactId: t.contactIds[0]!,
      now: () => NOW,
    });
    const dates = await ports.listDates({
      serviceId: t.serviceIds[0]!,
      from: '2031-01-06',
      days: 7,
    });
    expect(dates).toEqual(['2031-01-07', '2031-01-08', '2031-01-09', '2031-01-10', '2031-01-11']);
  });
});
