import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);

describe('regras de etapa criadas pela dona', () => {
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

  const stageByName = async (tenantId: string, name: string) =>
    withTenant(prisma, tenantId, (tx) => tx.stage.findFirstOrThrow({ where: { name } }));

  it('mostra a regra padrão de cada acontecimento', async () => {
    const res = await owner.get('/panel/pipeline/rules');
    expect(res.status).toBe(200);
    const scheduled = await stageByName(t.tenantId, 'Agendou');
    const created = res.body.rules.find(
      (r: { event: string }) => r.event === 'appointment.created',
    );
    expect(created).toEqual({ event: 'appointment.created', defaultStageId: scheduled.id });
    const noShow = res.body.rules.find((r: { event: string }) => r.event === 'appointment.no_show');
    expect(noShow.defaultStageId).toBeNull();
    expect(res.body.stages.map((s: { name: string }) => s.name)).toContain('Não seguiu');
  });

  it('"se faltou, colocar em Não seguiu" passa a valer na hora', async () => {
    const lost = await stageByName(t.tenantId, 'Não seguiu');
    const save = await owner.put('/panel/pipeline/rules', {
      rules: [
        { event: 'appointment.no_show', stageId: lost.id },
        { event: 'faq.viewed', stageId: null },
      ],
    });
    expect(save.status).toBe(200);
    const faq = save.body.rules.find((r: { event: string }) => r.event === 'faq.viewed');
    expect(faq.stageId).toBeNull();

    const res = await owner.post(`/panel/appointments/${t.appointmentId}/status`, {
      status: 'NO_SHOW',
    });
    expect(res.status).toBeLessThan(300);
    const deal = await withTenant(prisma, t.tenantId, (tx) =>
      tx.deal.findFirstOrThrow({ where: { contactId: t.contactIds[0]! } }),
    );
    expect(deal.stageId).toBe(lost.id);
  });

  it('recusa etapa de outro negócio e acontecimento repetido', async () => {
    const foreign = await stageByName(other.tenantId, 'Não seguiu');
    const res = await owner.put('/panel/pipeline/rules', {
      rules: [{ event: 'appointment.no_show', stageId: foreign.id }],
    });
    expect(res.status).toBe(400);
    const dup = await owner.put('/panel/pipeline/rules', {
      rules: [
        { event: 'faq.viewed', stageId: null },
        { event: 'faq.viewed', stageId: null },
      ],
    });
    expect(dup.status).toBe(400);
    const unknown = await owner.put('/panel/pipeline/rules', {
      rules: [{ event: 'inventado', stageId: null }],
    });
    expect(unknown.status).toBe(400);
  });
});
