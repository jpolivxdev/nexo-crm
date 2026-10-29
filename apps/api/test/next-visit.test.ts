import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { NEXT_VISIT_TASK } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);

describe('gatilho de fechamento: realizado vira "oferecer o próximo horário"', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let owner: Awaited<ReturnType<typeof ownerSession>>;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    owner = await ownerSession(app, prisma, t.tenantId);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const tasks = () =>
    withTenant(prisma, t.tenantId, (tx) =>
      tx.task.findMany({ where: { contactId: t.contactIds[0]!, title: NEXT_VISIT_TASK } }),
    );

  it('cria o "a fazer" uma vez e ele aparece no Hoje com o nome da cliente', async () => {
    const res = await owner.post(`/panel/appointments/${t.appointmentId}/status`, {
      status: 'DONE',
    });
    expect(res.status).toBeLessThan(300);
    expect(await tasks()).toHaveLength(1);

    const today = await owner.get('/panel/today');
    const task = today.body.tasks.find((x: { title: string }) => x.title === NEXT_VISIT_TASK);
    expect(task.contact.name).toBe('Cliente Exemplo 1 (demo)');
  });

  it('não cria se a cliente já tem outro horário marcado para frente', async () => {
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: t.tenantId,
          contactId: t.contactIds[0]!,
          serviceId: t.serviceIds[0]!,
          professionalId: t.professionalId,
          startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          source: 'PANEL',
        },
      }),
    );
    await owner.post(`/panel/appointments/${t.appointmentId}/status`, { status: 'DONE' });
    expect(await tasks()).toHaveLength(0);
  });
});
