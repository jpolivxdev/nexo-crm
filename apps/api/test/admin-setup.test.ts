import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptField } from '../src/auth/field-crypto.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCode } from '../src/auth/totp.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const FIELD_KEY = randomBytes(32).toString('base64');
const PASSWORD = 'senha-de-teste-forte-123';

describe('admin nexo, senha provisória e assistente de configuração', () => {
  let app: INestApplication;
  const secret = generateTotpSecret();
  const adminEmail = `admin-${randomUUID()}@nexo.test`;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false', FIELD_ENCRYPTION_KEY: FIELD_KEY }));
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin Teste',
        role: 'NEXO_ADMIN',
        passwordHash: await hashPassword(PASSWORD),
        totpSecretEnc: encryptField(secret, FIELD_KEY),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function login(email: string, password: string, totp?: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password, ...(totp ? { totp } : {}) });
    const cookie =
      (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';
    return { res, cookie, csrf: res.body.csrfToken as string };
  }

  const loginAdmin = () => login(adminEmail, PASSWORD, totpCode(secret, new Date()));

  function as(session: { cookie: string; csrf: string }) {
    return {
      get: (path: string) => http().get(path).set('cookie', session.cookie),
      post: (path: string, body: object = {}) =>
        http()
          .post(path)
          .set('cookie', session.cookie)
          .set('x-csrf-token', session.csrf)
          .send(body),
      put: (path: string, body: object) =>
        http().put(path).set('cookie', session.cookie).set('x-csrf-token', session.csrf).send(body),
    };
  }

  async function createBusiness() {
    const admin = as(await loginAdmin());
    const ownerEmail = `dona-${randomUUID()}@exemplo.test`;
    const created = await admin.post('/admin/tenants', {
      name: 'Studio Novo (demo)',
      niche: 'cilios',
      ownerName: 'Bia (demo)',
      ownerEmail,
    });
    expect(created.status).toBe(201);
    return {
      admin,
      ownerEmail,
      ...(created.body as { tenantId: string; temporaryPassword: string }),
    };
  }

  it('cria o negócio com senha provisória; a dona troca a senha antes de usar o painel', async () => {
    const { ownerEmail, temporaryPassword } = await createBusiness();
    const first = await login(ownerEmail, temporaryPassword);
    expect(first.res.body).toMatchObject({ mustChangePassword: true, onboardingPending: true });
    expect((await as(first).get('/panel/today')).status).toBe(403);

    const short = await as(first).post('/auth/password', {
      currentPassword: temporaryPassword,
      newPassword: 'curta',
    });
    expect(short.status).toBe(400);
    const changed = await as(first).post('/auth/password', {
      currentPassword: temporaryPassword,
      newPassword: 'nova-senha-da-dona-123',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.mustChangePassword).toBe(false);

    // A sessão antiga caiu; a nova (cookie novo) funciona.
    expect((await as(first).get('/auth/me')).status).toBe(401);
    const cookie = (changed.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const next = { cookie, csrf: changed.body.csrfToken as string };
    expect((await as(next).get('/panel/today')).status).toBe(200);
    expect((await login(ownerEmail, temporaryPassword)).res.status).toBe(401);
  });

  it('assistente: negócio, serviços, horários e dúvidas; fecha o cronômetro do onboarding', async () => {
    const { admin, ownerEmail, temporaryPassword, tenantId } = await createBusiness();
    const first = await login(ownerEmail, temporaryPassword);
    const changed = await as(first).post('/auth/password', {
      currentPassword: temporaryPassword,
      newPassword: 'nova-senha-da-dona-123',
    });
    const owner = as({
      cookie: (changed.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!,
      csrf: changed.body.csrfToken,
    });

    const start = await owner.get('/panel/setup');
    expect(start.body.business).toMatchObject({
      name: 'Studio Novo (demo)',
      attendantName: 'Bia (demo)',
    });
    expect((await owner.post('/panel/setup/complete')).status).toBe(400);

    expect(
      (
        await owner.put('/panel/setup/business', {
          name: 'Studio Novo (demo)',
          attendantName: 'Bia (demo)',
          slotStepMinutes: 60,
          minNoticeMinutes: 120,
        })
      ).status,
    ).toBe(200);
    const services = await owner.put('/panel/setup/services', {
      services: [
        { name: 'Fio a fio (demo)', durationMinutes: 90, priceCents: null },
        { name: 'Manutenção (demo)', durationMinutes: 60 },
      ],
    });
    expect(services.body.services).toHaveLength(2);

    // Tirar um serviço da lista desativa, sem apagar.
    const kept = services.body.services[0];
    const after = await owner.put('/panel/setup/services', { services: [kept] });
    expect(after.body.services.map((s: { id: string }) => s.id)).toEqual([kept.id]);

    const overlap = await owner.put('/panel/setup/hours', {
      windows: [
        { weekday: 2, startMinute: 540, endMinute: 720 },
        { weekday: 2, startMinute: 700, endMinute: 800 },
      ],
    });
    expect(overlap.status).toBe(400);
    const hours = await owner.put('/panel/setup/hours', {
      windows: [
        { weekday: 2, startMinute: 540, endMinute: 720 },
        { weekday: 3, startMinute: 540, endMinute: 1080 },
      ],
    });
    expect(hours.body.windows).toHaveLength(2);

    const faq = await owner.put('/panel/setup/faq', {
      items: [{ question: 'Onde fica?', answer: 'Rua Exemplo, 100 (demo).' }],
    });
    expect(faq.body.faq).toHaveLength(1);

    const done = await owner.post('/panel/setup/complete');
    expect(done.status).toBe(200);
    expect(done.body.onboardingCompletedAt).not.toBeNull();

    // O serviço novo já aparece para marcar horário e o admin vê o tempo de onboarding.
    expect((await owner.get('/panel/services')).body).toHaveLength(1);
    const list = await admin.get('/admin/tenants');
    const row = list.body.find((t: { id: string }) => t.id === tenantId);
    expect(row.onboardingMinutes).toEqual(expect.any(Number));
  });

  it('admin só vê o painel de um negócio com motivo, 2FA de novo e registro na auditoria', async () => {
    const { tenantId } = await createBusiness();
    const session = await loginAdmin();
    const admin = as(session);
    expect((await admin.get('/panel/today')).status).toBe(403);

    expect(
      (await admin.post(`/admin/tenants/${tenantId}/access`, { reason: 'curto', totp: '123456' }))
        .status,
    ).toBe(400);
    expect(
      (
        await admin.post(`/admin/tenants/${tenantId}/access`, {
          reason: 'Ajudar a dona a cadastrar os serviços',
          totp: '000000',
        })
      ).status,
    ).toBe(401);
    const ok = await admin.post(`/admin/tenants/${tenantId}/access`, {
      reason: 'Ajudar a dona a cadastrar os serviços',
      totp: totpCode(secret, new Date()),
    });
    expect(ok.status).toBe(200);

    const today = await admin.get('/panel/today');
    expect(today.status).toBe(200);
    expect(today.body.businessName).toBe('Studio Novo (demo)');

    const audit = await withTenant(prisma, tenantId, (tx) =>
      tx.auditLog.findMany({ where: { action: 'admin.access_started' } }),
    );
    expect(audit.map((a) => a.reason)).toEqual(['Ajudar a dona a cadastrar os serviços']);

    expect((await admin.post('/admin/access/end')).status).toBe(200);
    expect((await admin.get('/panel/today')).status).toBe(403);
  });

  it('dona não entra na área do admin', async () => {
    const { ownerEmail, temporaryPassword } = await createBusiness();
    const first = await login(ownerEmail, temporaryPassword);
    expect((await as(first).get('/admin/tenants')).status).toBe(403);
  });
});
