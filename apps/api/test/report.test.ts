import type { Prisma } from '../src/generated/prisma/client.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { noShowRate, ReportService } from '../src/report/report.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const reports = new ReportService({ withTenant: (id, fn) => withTenant(prisma, id, fn) });
// Quarta, 15/01/2031, 12h em São Paulo.
const NOW = new Date('2031-01-15T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('relatório mínimo (M9)', () => {
  let t: DemoTenant;
  let other: DemoTenant;

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, new Date(NOW.getTime() - 60 * DAY));
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!, new Date(NOW.getTime() - 60 * DAY));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Horário fictício direto no banco: o relatório só lê, as regras de agenda já têm teste. */
  async function appointment(
    tenant: DemoTenant,
    data: Partial<Prisma.AppointmentUncheckedCreateInput> & { startsAt: Date },
  ) {
    await withTenant(prisma, tenant.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: tenant.tenantId,
          contactId: tenant.contactIds[0]!,
          serviceId: tenant.serviceIds[0]!,
          professionalId: tenant.professionalId,
          endsAt: new Date(data.startsAt.getTime() + 60 * 60 * 1000),
          source: 'WHATSAPP',
          createdAt: NOW,
          ...data,
        },
      }),
    );
  }

  async function event(tenant: DemoTenant, type: string, actorType: string, createdAt = NOW) {
    await withTenant(prisma, tenant.tenantId, (tx) =>
      tx.event.create({
        data: {
          tenantId: tenant.tenantId,
          type,
          entityType: 'contact',
          entityId: tenant.contactIds[0]!,
          actorType,
          createdAt,
        },
      }),
    );
  }

  it('conta agendamentos pelo robô, faltas, passagens e pedidos de parar do período', async () => {
    // Começa vazio: os dados do negócio demo ficaram 60 dias antes.
    const before = await reports.summary(t.tenantId, 7, NOW);
    expect(before).toMatchObject({
      from: '2031-01-09',
      to: '2031-01-15',
      newContacts: 0,
      booked: { total: 0 },
      handoffs: 0,
    });

    const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
    await appointment(t, { startsAt: ago(1), status: 'DONE' });
    await appointment(t, { startsAt: ago(2), status: 'DONE' });
    await appointment(t, { startsAt: ago(3), status: 'DONE', source: 'PANEL' });
    await appointment(t, { startsAt: ago(4), status: 'NO_SHOW' });
    await appointment(t, { startsAt: ago(5), status: 'CANCELLED' });
    // Marcado hoje para amanhã: conta em "marcados", mas fica fora dos atendimentos do período.
    await appointment(t, { startsAt: new Date(NOW.getTime() + DAY) });
    // Fora do período de 7 dias.
    await appointment(t, { startsAt: ago(20), status: 'NO_SHOW', createdAt: ago(25) });
    await event(t, 'handoff.requested', 'contact');
    await event(t, 'handoff.requested', 'contact');
    await event(t, 'contact.opted_out', 'contact');
    await event(t, 'appointment.confirmed', 'contact');
    await event(t, 'appointment.confirmed', 'user');
    await event(t, 'handoff.requested', 'contact', ago(10));

    const week = await reports.summary(t.tenantId, 7, NOW);
    expect(week.booked).toEqual({ total: 6, byBot: 5, byPanel: 1 });
    expect(week.outcomes).toEqual({ done: 3, noShow: 1, cancelled: 1, noShowRate: 25 });
    expect(week.handoffs).toBe(2);
    expect(week.optOuts).toBe(1);
    expect(week.confirmedByClient).toBe(1);
    expect(week.byProfessional).toEqual([
      { id: t.professionalId, name: expect.any(String), count: 4 },
    ]);
    expect(week.byStage.length).toBeGreaterThan(0);

    const month = await reports.summary(t.tenantId, 30, NOW);
    expect(month.outcomes.noShow).toBe(2);
    expect(month.handoffs).toBe(3);
  });

  it('não mistura negócios', async () => {
    await appointment(other, { startsAt: new Date(NOW.getTime() - DAY), status: 'NO_SHOW' });
    await event(other, 'handoff.requested', 'contact');
    const mine = await reports.summary(t.tenantId, 7, NOW);
    expect(mine.booked.total).toBe(0);
    expect(mine.outcomes.noShow).toBe(0);
    expect(mine.handoffs).toBe(0);
  });

  it('taxa de faltas só existe quando já houve atendimento', () => {
    expect(noShowRate(0, 0)).toBeNull();
    expect(noShowRate(3, 1)).toBe(25);
    expect(noShowRate(2, 1)).toBe(33);
  });
});
