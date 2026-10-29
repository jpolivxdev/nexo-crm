import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { type ConsoleMailer, MAILER } from '../src/mail/mailer.js';
import { RealtimeBus, type RealtimeNotice } from '../src/realtime/realtime.bus.js';
import { alertEmail, OwnerAlerts } from '../src/scheduling/owner-alerts.js';
import { NEXT_VISIT_TASK, SchedulingService } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

describe('avisos para a dona e prazo do "oferecer o próximo horário"', () => {
  let app: INestApplication;
  let mailer: ConsoleMailer;
  let scheduling: SchedulingService;
  let t: DemoTenant;
  let owner: Awaited<ReturnType<typeof ownerSession>>;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
    mailer = app.get<ConsoleMailer>(MAILER);
    scheduling = app.get(SchedulingService);
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    owner = await ownerSession(app, prisma, t.tenantId);
    mailer.outbox.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  /** Primeiro horário livre nos próximos dias. */
  async function freeSlot() {
    for (let i = 1; i < 15; i++) {
      const date = new Date(Date.now() + i * DAY).toISOString().slice(0, 10);
      const slots = await scheduling.listSlots(t.tenantId, {
        serviceId: t.serviceIds[0]!,
        date: date as never,
      });
      if (slots.length) return slots[0]!.startsAt;
    }
    throw new Error('sem horário livre no demo');
  }

  const book = async (actor: 'contact' | 'user') =>
    scheduling.book(t.tenantId, {
      contactId: t.contactIds[1]!,
      serviceId: t.serviceIds[0]!,
      startsAt: await freeSlot(),
      source: actor === 'contact' ? 'WHATSAPP' : 'PANEL',
      actor: { type: actor },
    });

  const sentTo = (subject: RegExp) => mailer.outbox.filter((m) => subject.test(m.subject));

  it('e-mail desligado por padrão; ligado, avisa quando a cliente marca e cancela pelo WhatsApp', async () => {
    const notices: RealtimeNotice[] = [];
    const off = app.get(RealtimeBus).subscribe(t.tenantId, (n) => notices.push(n));

    const first = await book('contact');
    expect(notices.at(-1)).toEqual({ type: 'agenda.changed', id: first.id, alert: 'booked' });
    await new Promise((r) => setTimeout(r, 50));
    expect(mailer.outbox).toHaveLength(0);

    const saved = await owner.put('/panel/setup/alerts', { notifyEmail: true, nextVisitDays: 10 });
    expect(saved.body).toEqual({ notifyEmail: true, nextVisitDays: 10, emailAvailable: true });

    await scheduling.setStatus(t.tenantId, first.id, 'CANCELLED', { type: 'contact' });
    await vi.waitFor(() => expect(sentTo(/^Horário cancelado/)).toHaveLength(1));
    const mail = sentTo(/^Horário cancelado/)[0]!;
    expect(mail.text).not.toContain('Cliente Exemplo');
    expect(mail.text).toContain('Uma cliente cancelou pelo WhatsApp');

    await app.get(OwnerAlerts).handoffRequested(t.tenantId);
    expect(sentTo(/quer falar com você/)).toHaveLength(1);
    off();
  });

  it('o que a dona faz pelo painel não vira aviso', async () => {
    await owner.put('/panel/setup/alerts', { notifyEmail: true, nextVisitDays: 0 });
    const notices: RealtimeNotice[] = [];
    const off = app.get(RealtimeBus).subscribe(t.tenantId, (n) => notices.push(n));
    await book('user');
    await new Promise((r) => setTimeout(r, 50));
    expect(notices.at(-1)?.alert).toBeUndefined();
    expect(mailer.outbox).toHaveLength(0);
    off();
  });

  it('o "oferecer o próximo horário" espera os dias combinados e some quando a cliente marca', async () => {
    await owner.put('/panel/setup/alerts', { notifyEmail: false, nextVisitDays: 10 });
    await owner.post(`/panel/appointments/${t.appointmentId}/status`, { status: 'DONE' });
    const tasks = () =>
      withTenant(prisma, t.tenantId, (tx) =>
        tx.task.findMany({ where: { contactId: t.contactIds[0]!, title: NEXT_VISIT_TASK } }),
      );
    const [task] = await tasks();
    expect(task!.dueAt!.getTime()).toBeGreaterThan(Date.now() + 9.9 * DAY);
    const today = await owner.get('/panel/today');
    expect(today.body.tasks.map((x: { title: string }) => x.title)).not.toContain(NEXT_VISIT_TASK);

    await scheduling.book(t.tenantId, {
      contactId: t.contactIds[0]!,
      serviceId: t.serviceIds[0]!,
      startsAt: await freeSlot(),
      source: 'WHATSAPP',
      actor: { type: 'contact' },
    });
    expect((await tasks())[0]!.doneAt).not.toBeNull();
  });

  it('desligado, não cria o "a fazer"', async () => {
    await owner.put('/panel/setup/alerts', { notifyEmail: false, nextVisitDays: null });
    await owner.post(`/panel/appointments/${t.appointmentId}/status`, { status: 'DONE' });
    const count = await withTenant(prisma, t.tenantId, (tx) =>
      tx.task.count({ where: { title: NEXT_VISIT_TASK } }),
    );
    expect(count).toBe(0);
  });

  it('texto do e-mail no fuso do negócio', () => {
    const mail = alertEmail('booked', {
      businessName: 'Estúdio Exemplo (demo)',
      serviceName: 'Fio a fio (demo)',
      startsAt: new Date('2031-01-16T12:00:00Z'),
      timeZone: 'America/Sao_Paulo',
    });
    expect(mail.subject).toBe('Horário novo: quinta, 16/01 às 09:00');
  });
});
