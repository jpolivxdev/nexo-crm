import type { INestApplication } from '@nestjs/common';
import type { AppointmentStatus } from '../src/generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

describe('visões de clientes: frequentes, sumidas e faltosas', () => {
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
    // O horário de amanhã do demo atrapalharia "sumida": tira da conta.
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.update({ where: { id: t.appointmentId }, data: { status: 'CANCELLED' } }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  /** Horário fictício há N dias (ou daqui a N dias, se negativo). */
  async function appt(
    tenant: DemoTenant,
    contact: number,
    daysAgo: number,
    status: AppointmentStatus,
  ) {
    const startsAt = new Date(Date.now() - daysAgo * DAY);
    await withTenant(prisma, tenant.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: tenant.tenantId,
          contactId: tenant.contactIds[contact]!,
          serviceId: tenant.serviceIds[0]!,
          professionalId: tenant.professionalId,
          // Horários em minutos diferentes para não baterem na trava de horário duplo.
          startsAt: new Date(startsAt.getTime() + contact * 7 * 60 * 1000),
          endsAt: new Date(startsAt.getTime() + contact * 7 * 60 * 1000 + 5 * 60 * 1000),
          status,
          source: 'PANEL',
        },
      }),
    );
  }

  const segment = async (name: string) => {
    const res = await owner.get(`/panel/contacts?segment=${name}`);
    expect(res.status).toBe(200);
    return res.body as { id: string; stats: Record<string, unknown> }[];
  };

  it('separa frequentes, sumidas e faltosas com os números de cada uma', async () => {
    // Cliente 0: 3 atendimentos recentes → frequente.
    for (const d of [10, 30, 50]) await appt(t, 0, d, 'DONE');
    // Cliente 1: atendida há 70 dias, sem horário marcado → sumida; 2 faltas → faltosa.
    await appt(t, 1, 70, 'DONE');
    await appt(t, 1, 20, 'NO_SHOW');
    await appt(t, 1, 40, 'NO_SHOW');
    // Cliente 2: atendida há 80 dias, mas já marcou de novo → não está sumida.
    await appt(t, 2, 80, 'DONE');
    await appt(t, 2, -5, 'SCHEDULED');
    // Outro negócio com o mesmo padrão não aparece.
    for (const d of [10, 30, 50]) await appt(other, 0, d, 'DONE');

    const frequent = await segment('frequent');
    expect(frequent.map((c) => c.id)).toEqual([t.contactIds[0]]);
    expect(frequent[0]!.stats).toMatchObject({ doneCount: 3 });

    const missing = await segment('missing');
    expect(missing.map((c) => c.id)).toEqual([t.contactIds[1]]);
    expect(missing[0]!.stats.lastDoneAt).toBeTruthy();

    const noShow = await segment('no_show');
    expect(noShow.map((c) => c.id)).toEqual([t.contactIds[1]]);
    expect(noShow[0]!.stats).toMatchObject({ noShowCount: 2 });
  });

  it('atendimento antigo (fora dos 180 dias) não conta para frequente', async () => {
    for (const d of [10, 200, 250]) await appt(t, 0, d, 'DONE');
    expect(await segment('frequent')).toEqual([]);
  });

  it('recusa visão desconhecida', async () => {
    expect((await owner.get('/panel/contacts?segment=vip')).status).toBe(400);
  });
});
