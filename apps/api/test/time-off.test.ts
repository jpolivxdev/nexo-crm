import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);
// Quarta-feira: o negócio demo atende das 9h às 12h e das 13h às 18h (São Paulo).
const DAY = '2031-01-15';

describe('folgas e bloqueios', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let other: DemoTenant;
  let owner: Awaited<ReturnType<typeof ownerSession>>;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    owner = await ownerSession(app, prisma, t.tenantId);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const slots = async () => {
    const res = await owner.get(`/panel/slots?serviceId=${t.serviceIds[0]}&date=${DAY}`);
    return (res.body as { startsAt: string }[]).map((s) => s.startsAt);
  };

  it('bloqueio de algumas horas tira esses horários da agenda e some quando é removido', async () => {
    const before = await slots();
    expect(before).toContain('2031-01-15T13:00:00.000Z'); // 10h em São Paulo

    const res = await owner.post('/panel/time-off', {
      startDate: DAY,
      endDate: DAY,
      startTime: '09:00',
      endTime: '12:00',
      reason: 'Dentista',
    });
    expect(res.status).toBe(201);
    expect(res.body.timeOff).toMatchObject({
      startsAt: '2031-01-15T12:00:00.000Z',
      endsAt: '2031-01-15T15:00:00.000Z',
      reason: 'Dentista',
    });
    const during = await slots();
    expect(during).not.toContain('2031-01-15T13:00:00.000Z');
    expect(during.length).toBeGreaterThan(0); // a tarde continua livre

    const list = await owner.get('/panel/time-off');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.professionals).toHaveLength(1);

    expect((await owner.del(`/panel/time-off/${res.body.timeOff.id}`)).status).toBe(200);
    expect(await slots()).toEqual(before);
  });

  it('dia todo fecha o dia inteiro e avisa dos horários que já estavam marcados', async () => {
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: t.tenantId,
          contactId: t.contactIds[1]!,
          serviceId: t.serviceIds[0]!,
          professionalId: t.professionalId,
          startsAt: new Date('2031-01-16T14:00:00Z'),
          endsAt: new Date('2031-01-16T15:00:00Z'),
          source: 'PANEL',
        },
      }),
    );
    const res = await owner.post('/panel/time-off', { startDate: DAY, endDate: '2031-01-16' });
    expect(res.status).toBe(201);
    expect(res.body.timeOff).toMatchObject({
      startsAt: '2031-01-15T03:00:00.000Z',
      endsAt: '2031-01-17T03:00:00.000Z',
    });
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0].contact.name).toBe('Cliente Exemplo 2 (demo)');
    expect(await slots()).toEqual([]);
  });

  it('confere as entradas', async () => {
    const half = await owner.post('/panel/time-off', {
      startDate: DAY,
      endDate: DAY,
      startTime: '09:00',
    });
    expect(half.status).toBe(400);
    expect(half.body.message).toContain('duas horas');
    const backwards = await owner.post('/panel/time-off', {
      startDate: DAY,
      endDate: '2031-01-14',
    });
    expect(backwards.status).toBe(400);
    const past = await owner.post('/panel/time-off', {
      startDate: '2020-01-01',
      endDate: '2020-01-02',
    });
    expect(past.body.message).toContain('já passou');
    const foreignPro = await owner.post('/panel/time-off', {
      startDate: DAY,
      endDate: DAY,
      professionalId: other.professionalId,
    });
    expect(foreignPro.status).toBe(404);
  });

  it('não vê nem remove bloqueio de outro negócio', async () => {
    const theirs = await withTenant(prisma, other.tenantId, (tx) =>
      tx.timeOff.create({
        data: {
          tenantId: other.tenantId,
          startsAt: new Date('2031-02-01T12:00:00Z'),
          endsAt: new Date('2031-02-01T15:00:00Z'),
        },
      }),
    );
    expect((await owner.get('/panel/time-off')).body.items).toHaveLength(0);
    expect((await owner.del(`/panel/time-off/${theirs.id}`)).status).toBe(404);
  });
});
