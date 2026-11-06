import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { OutgoingMessage } from '@nexo/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../src/channel/channel.registry.js';
import { SimulatorChannel } from '../src/channel/simulator.channel.js';
import { ConversationService } from '../src/conversation/conversation.service.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import type { Plan } from '../src/generated/prisma/client.js';
import { ReminderService } from '../src/reminders/reminder.service.js';
import { SchedulingService } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);
const NOW = new Date('2031-01-06T15:00:00Z');
const H = 60 * 60 * 1000;

describe('trava por plano no servidor', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let owner: Awaited<ReturnType<typeof ownerSession>>;
  let sent: OutgoingMessage[];

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
    owner = await ownerSession(app, prisma, t.tenantId);
    sent = [];
    app
      .get(ChannelRegistry)
      .registerSimulator('terminal', new SimulatorChannel((_to, m) => sent.push(m)));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const setPlan = (plan: Plan, features: string[] = []) =>
    withTenant(prisma, t.tenantId, (tx) =>
      tx.tenant.update({ where: { id: t.tenantId }, data: { plan, features } }),
    );

  it('Completo (padrão) tem tudo', async () => {
    expect((await owner.get('/panel/agenda?from=2031-01-08&days=1')).status).toBe(200);
    expect((await owner.get('/panel/report')).status).toBe(200);
    expect((await owner.get('/panel/time-off')).status).toBe(200);
    expect((await owner.get('/auth/me')).body).toMatchObject({
      plan: 'COMPLETE',
      features: ['report', 'agenda', 'bot', 'reminders'],
    });
  });

  it('Grátis: clientes e etapas funcionam; agenda, folgas e resultados dão 403 com aviso', async () => {
    await setPlan('FREE');
    expect((await owner.get('/panel/contacts')).status).toBe(200);
    expect((await owner.get('/panel/pipeline')).status).toBe(200);
    expect((await owner.get('/panel/today')).status).toBe(200);

    const agenda = await owner.get('/panel/agenda?from=2031-01-08&days=1');
    expect(agenda.status).toBe(403);
    expect(agenda.body.message).toBe('Este recurso não faz parte do plano do seu negócio.');
    expect((await owner.get('/panel/report')).status).toBe(403);
    expect((await owner.get('/panel/time-off')).status).toBe(403);
    const book = await owner.post('/panel/appointments', {
      contactId: t.contactIds[0],
      serviceId: t.serviceIds[0],
      startsAt: '2031-01-08T13:00:00.000Z',
    });
    expect(book.status).toBe(403);
  });

  it('CRM tem resultados mas não agenda; recurso liberado à parte soma ao plano', async () => {
    await setPlan('CRM');
    expect((await owner.get('/panel/report')).status).toBe(200);
    expect((await owner.get('/panel/agenda?from=2031-01-08&days=1')).status).toBe(403);
    await setPlan('CRM', ['agenda']);
    expect((await owner.get('/panel/agenda?from=2031-01-08&days=1')).status).toBe(200);
  });

  it('sem o robô no plano: a mensagem fica registrada no CRM, mas o robô não responde', async () => {
    await setPlan('FREE');
    const phone = `55000${randomInt(1e7, 9e7)}`;
    await app.get(ConversationService).handleInbound(
      t.tenantId,
      {
        channel: 'simulator',
        businessExternalId: 'terminal',
        externalId: `plan-${Date.now()}`,
        from: phone,
        profileName: 'Cliente Teste',
        type: 'text',
        input: { kind: 'text', text: 'oi' },
        body: 'oi',
        receivedAt: NOW.toISOString(),
      },
      NOW,
    );
    expect(sent).toEqual([]);
    const messages = await withTenant(prisma, t.tenantId, (tx) =>
      tx.message.findMany({ where: { conversation: { contact: { phone } } } }),
    );
    expect(messages.map((m) => m.direction)).toEqual(['INBOUND']);
  });

  it('sem lembretes no plano: o lembrete é cancelado, não enviado', async () => {
    const scheduling = app.get(SchedulingService);
    const [slot] = await scheduling.listSlots(t.tenantId, {
      serviceId: t.serviceIds[0]!,
      date: '2031-01-10',
      now: NOW,
    });
    const appt = await scheduling.book(t.tenantId, {
      contactId: t.contactIds[0]!,
      serviceId: t.serviceIds[0]!,
      startsAt: slot!.startsAt,
      source: 'PANEL',
      actor: { type: 'user' },
      now: NOW,
    });
    await setPlan('CRM');
    const result = await app
      .get(ReminderService)
      .runDue(new Date(appt.startsAt.getTime() - 24 * H), { tenantIds: [t.tenantId] });
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    const reminders = await withTenant(prisma, t.tenantId, (tx) =>
      tx.reminder.findMany({ where: { appointmentId: appt.id }, orderBy: { sendAt: 'asc' } }),
    );
    expect(reminders[0]!.status).toBe('CANCELLED');
  });
});
