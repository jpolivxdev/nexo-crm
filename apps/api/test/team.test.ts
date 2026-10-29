import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);
const HOUR = 60 * 60 * 1000;

describe('equipe: várias profissionais e o acesso de cada uma', () => {
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

  const http = () => request(app.getHttpServer());

  /** Cria a profissional, o acesso dela e entra (trocando a senha provisória). */
  async function staffSession(name = 'Profissional Dois (demo)') {
    const list = await owner.post('/panel/team', { name });
    const pro = list.body.professionals.find((p: { name: string }) => p.name === name);
    const email = `equipe-${randomUUID()}@exemplo.test`;
    const login = await owner.post(`/panel/team/${pro.id}/login`, { email });
    expect(login.status).toBe(201);
    const first = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: login.body.temporaryPassword });
    expect(first.body.mustChangePassword).toBe(true);
    let cookie = (first.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const changed = await http()
      .post('/auth/password')
      .set('cookie', cookie)
      .set('x-csrf-token', first.body.csrfToken)
      .send({
        currentPassword: login.body.temporaryPassword,
        newPassword: 'senha-da-equipe-forte-1',
      });
    expect(changed.status).toBe(200);
    cookie = (changed.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const csrf = changed.body.csrfToken as string;
    return {
      pro,
      email,
      get: (path: string) => http().get(path).set('cookie', cookie),
      post: (path: string, body?: object) =>
        http().post(path).set('cookie', cookie).set('x-csrf-token', csrf).send(body),
    };
  }

  it('nova profissional começa com os serviços e horários da dona e pode ser ajustada', async () => {
    const res = await owner.post('/panel/team', { name: 'Profissional Dois (demo)' });
    expect(res.status).toBe(201);
    const [first, second] = res.body.professionals;
    expect(first.isOwner).toBe(true);
    expect(second).toMatchObject({ name: 'Profissional Dois (demo)', active: true, login: null });
    expect(second.serviceIds.sort()).toEqual([...t.serviceIds].sort());
    expect(second.windows).toEqual(first.windows);

    const updated = await owner.put(`/panel/team/${second.id}`, {
      name: 'Profissional Dois (demo)',
      active: true,
      serviceIds: [t.serviceIds[0]],
      windows: [{ weekday: 3, startMinute: 600, endMinute: 900 }],
    });
    expect(updated.status).toBe(200);
    const after = updated.body.professionals[1];
    expect(after.serviceIds).toEqual([t.serviceIds[0]]);
    expect(after.windows).toEqual([{ weekday: 3, startMinute: 600, endMinute: 900 }]);

    // Com duas profissionais, o horário de quarta tem as duas como opção.
    const slots = await owner.get(`/panel/slots?serviceId=${t.serviceIds[0]}&date=2031-01-15`);
    expect(slots.body.length).toBeGreaterThan(0);
  });

  it('não desativa a agenda da dona; recusa horário sobreposto e serviço de outro negócio', async () => {
    const list = await owner.get('/panel/team');
    const mine = list.body.professionals[0];
    const base = { name: mine.name, serviceIds: mine.serviceIds, windows: mine.windows };
    expect((await owner.put(`/panel/team/${mine.id}`, { ...base, active: false })).status).toBe(
      400,
    );
    const overlap = await owner.put(`/panel/team/${mine.id}`, {
      ...base,
      active: true,
      windows: [
        { weekday: 2, startMinute: 540, endMinute: 720 },
        { weekday: 2, startMinute: 700, endMinute: 800 },
      ],
    });
    expect(overlap.status).toBe(400);
    const foreign = await owner.put(`/panel/team/${mine.id}`, {
      ...base,
      active: true,
      serviceIds: [other.serviceIds[0]],
    });
    expect(foreign.status).toBe(400);
    expect(
      (await owner.put(`/panel/team/${other.professionalId}`, { ...base, active: true })).status,
    ).toBe(404);
  });

  it('a profissional vê e marca só a própria agenda e não entra no resto do painel', async () => {
    const staff = await staffSession();
    // Um horário dela e o horário da dona (do demo) amanhã.
    const tomorrow = new Date(Date.now() + 24 * HOUR);
    const hers = await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: t.tenantId,
          contactId: t.contactIds[1]!,
          serviceId: t.serviceIds[0]!,
          professionalId: staff.pro.id,
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + HOUR),
          source: 'PANEL',
        },
      }),
    );
    const from = tomorrow.toISOString().slice(0, 10);
    const agenda = await staff.get(`/panel/agenda?from=${from}&days=2`);
    expect(agenda.status).toBe(200);
    expect(agenda.body.appointments.map((a: { id: string }) => a.id)).toEqual([hers.id]);

    expect(
      (await staff.post(`/panel/appointments/${t.appointmentId}/status`, { status: 'DONE' }))
        .status,
    ).toBe(404);
    expect(
      (await staff.post(`/panel/appointments/${hers.id}/status`, { status: 'DONE' })).status,
    ).toBe(200);

    const today = await staff.get('/panel/today');
    expect(today.status).toBe(200);
    expect(today.body).toMatchObject({ handoffs: [], tasks: [], activity: [] });

    for (const path of [
      '/panel/contacts',
      '/panel/report?days=7',
      '/panel/setup',
      '/panel/team',
      '/panel/time-off',
      '/panel/pipeline',
    ]) {
      expect((await staff.get(path)).status, path).toBe(403);
    }
    expect(
      (await staff.post(`/panel/contacts/${t.contactIds[0]}/erase`, { confirm: true })).status,
    ).toBe(403);
  });

  it('tirar o acesso derruba a sessão e libera o e-mail; a dona vê quem tem acesso', async () => {
    const staff = await staffSession();
    const list = await owner.get('/panel/team');
    expect(list.body.professionals[1].login).toBe(staff.email);
    expect((await owner.del(`/panel/team/${staff.pro.id}/login`)).status).toBe(200);
    expect((await staff.get('/panel/today')).status).toBe(401);
    const again = await owner.post(`/panel/team/${staff.pro.id}/login`, { email: staff.email });
    expect(again.status).toBe(201);
  });

  it('e-mail que já tem acesso é recusado', async () => {
    const staff = await staffSession();
    const list = await owner.post('/panel/team', { name: 'Profissional Três (demo)' });
    const third = list.body.professionals.find(
      (p: { name: string }) => p.name === 'Profissional Três (demo)',
    );
    expect((await owner.post(`/panel/team/${third.id}/login`, { email: staff.email })).status).toBe(
      409,
    );
  });
});
