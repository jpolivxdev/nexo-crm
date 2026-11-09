import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient } from '../src/database/prisma.js';
import type { Role } from '../src/generated/prisma/client.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('Premium: Painéis', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function user(tenantId: string, role: Role) {
    const email = `${role.toLowerCase()}-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: {
        email,
        name: `${role} (demo)`,
        role,
        tenantId,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    return email;
  }

  async function login(email: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(
      ';',
    )[0];
    const me = await http()
      .get('/auth/me')
      .set('cookie', cookie ?? '');
    return { cookie: cookie ?? '', csrf: res.body.csrfToken as string, userId: me.body.userId };
  }

  type Session = Awaited<ReturnType<typeof login>>;
  const get = (s: Session, path: string) => http().get(path).set('cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'put' | 'delete', path: string, body: object = {}) =>
    http()[method](path).set('cookie', s.cookie).set('x-csrf-token', s.csrf).send(body);

  async function tenant(plan: 'PREMIUM' | 'COMPLETE') {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { plan } });
    return t;
  }

  it('no Básico os painéis ficam fechados', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/crm/dashboard')).status).toBe(403);
    expect((await get(owner, '/panel/crm/overview')).status).toBe(403);
  });

  it('conta fechados, funil de conversão, metas por período e painel geral', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const pipelines = (await get(owner, '/panel/crm/pipelines')).body as {
      isDefault: boolean;
      stages: { id: string; kind: string; name: string }[];
    }[];
    const main = pipelines.find((p) => p.isDefault)!;
    const won = main.stages.find((s) => s.kind === 'WON')!;
    const created = await send(owner, 'post', '/panel/crm/deals', {
      name: 'Gabi (demo)',
      phone: '5515933330001',
      pipelineId: (await get(owner, '/panel/pipeline')).body.id,
      valueCents: 50000,
      expectedCloseOn: '2026-12-10',
    });
    expect(created.status).toBe(201);
    expect(
      (await send(owner, 'post', `/panel/deals/${created.body.id}/stage`, { stageId: won.id }))
        .status,
    ).toBe(200);

    const res = await get(owner, '/panel/crm/dashboard?period=month');
    expect(res.status).toBe(200);
    expect(res.body.numbers).toMatchObject({ wonCount: 1, wonCents: 50000, conversion: 100 });
    expect(res.body.numbers.newContacts).toBeGreaterThanOrEqual(1);
    const step = (res.body.funnel as { id: string; reached: number }[]).find(
      (s) => s.id === won.id,
    );
    expect(step?.reached).toBe(1);
    expect(res.body.funnel[0].reached).toBeGreaterThanOrEqual(1);

    // Filtrar por outra pessoa zera os fechados.
    await user(t.tenantId, 'CONSULTANT');
    const people = (await get(owner, '/panel/crm/people')).body as { id: string; role: string }[];
    const consultantId = people.find((p) => p.role === 'CONSULTANT')!.id;
    const filtered = await get(
      owner,
      `/panel/crm/dashboard?period=month&ownerUserId=${consultantId}`,
    );
    expect(filtered.body.numbers.wonCount).toBe(0);

    const goals = await send(owner, 'put', '/panel/crm/dashboard/goals', {
      period: 'week',
      goals: { wonCount: 5, revenueCents: 200000, newContacts: null },
    });
    expect(goals.status).toBe(200);
    const week = await get(owner, '/panel/crm/dashboard?period=week');
    expect(week.body.goals).toEqual({ wonCount: 5, revenueCents: 200000 });
    expect(week.body.progress.wonCount).toBe(1);

    // Meta do mês também vale na tela Resultados do Básico.
    await send(owner, 'put', '/panel/crm/dashboard/goals', {
      period: 'month',
      goals: { doneCount: 40 },
    });
    expect((await get(owner, '/panel/goals')).body.goals).toMatchObject({ doneCount: 40 });

    const overview = await get(owner, '/panel/crm/overview');
    expect(overview.status).toBe(200);
    expect(overview.body).toHaveProperty('openTickets');
    expect(overview.body.stages.length).toBeGreaterThan(0);
  });
});
