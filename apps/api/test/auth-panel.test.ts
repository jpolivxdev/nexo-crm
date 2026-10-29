import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptField } from '../src/auth/field-crypto.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCode } from '../src/auth/totp.js';
import { ConversationService } from '../src/conversation/conversation.service.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const FIELD_KEY = randomBytes(32).toString('base64');
const PASSWORD = 'senha-de-teste-forte-123';

async function createUser(
  tenantId: string | null,
  role: 'OWNER' | 'NEXO_ADMIN' = 'OWNER',
  totpSecret?: string,
) {
  const email = `u-${randomUUID()}@exemplo.test`;
  await prisma.user.create({
    data: {
      email,
      name: 'Dona Teste',
      role,
      tenantId,
      passwordHash: await hashPassword(PASSWORD),
      totpSecretEnc: totpSecret ? encryptField(totpSecret, FIELD_KEY) : null,
    },
  });
  return email;
}

describe('login, sessão e painel', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let other: DemoTenant;
  let email: string;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false', FIELD_ENCRYPTION_KEY: FIELD_KEY }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    email = await createUser(t.tenantId);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function login(user = email, password = PASSWORD, totp?: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email: user, password, ...(totp ? { totp } : {}) });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0];
    return { res, cookie: cookie?.split(';')[0] ?? '', csrf: res.body.csrfToken as string };
  }

  it('entra com e-mail e senha e recebe cookie HttpOnly e SameSite=Strict', async () => {
    const { res } = await login();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Dona Teste', role: 'OWNER' });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^nexo_sessao=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('senha errada e e-mail inexistente dão o mesmo erro genérico', async () => {
    const wrong = await login(email, 'senha-errada-qualquer');
    const missing = await login('ninguem@exemplo.test', PASSWORD);
    expect(wrong.res.status).toBe(401);
    expect(missing.res.status).toBe(401);
    expect(wrong.res.body.message).toBe(missing.res.body.message);
  });

  it('5 erros seguidos bloqueiam a conta, mesmo com a senha certa depois', async () => {
    for (let i = 0; i < 5; i++) await login(email, 'senha-errada-qualquer');
    expect((await login()).res.status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.lockedUntil).not.toBeNull();
  });

  it('sem sessão, o painel recusa; com sessão, mostra só o próprio negócio', async () => {
    expect((await http().get('/panel/today')).status).toBe(401);
    const { cookie } = await login();
    const today = await http().get('/panel/today').set('cookie', cookie);
    expect(today.status).toBe(200);
    expect(today.body.businessName).toBe('Estúdio Exemplo (demo)');

    // Cliente de outro negócio: não existe para esta sessão.
    const foreign = await http()
      .get(`/panel/contacts/${other.contactIds[0]}`)
      .set('cookie', cookie);
    expect(foreign.status).toBe(404);
    // Mandar tenantId pelo navegador não muda nada.
    const sneaky = await http()
      .get('/panel/today')
      .query({ tenantId: other.tenantId })
      .set('cookie', cookie);
    expect(sneaky.body.businessName).toBe('Estúdio Exemplo (demo)');
  });

  it('o que aconteceu: só eventos do próprio negócio, sem o payload', async () => {
    const event = (tenant: DemoTenant, contactId: string | undefined) =>
      withTenant(prisma, tenant.tenantId, (tx) =>
        tx.event.create({
          data: {
            tenantId: tenant.tenantId,
            type: 'handoff.requested',
            entityType: 'contact',
            entityId: tenant.contactIds[0]!,
            actorType: 'contact',
            payload: { contactId, segredo: 'não sai' },
          },
        }),
      );
    const mine = await event(t, t.contactIds[0]);
    const foreign = await event(other, other.contactIds[0]);
    // Payload apontando para cliente de outro negócio: o RLS não devolve a cliente.
    const crossed = await event(t, other.contactIds[0]);

    const { cookie } = await login();
    const today = await http().get('/panel/today').set('cookie', cookie);
    const activity = today.body.activity as {
      id: string;
      contact: { id: string } | null;
    }[];
    const ids = activity.map((a) => a.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(foreign.id);
    expect(activity.find((a) => a.id === mine.id)?.contact?.id).toBe(t.contactIds[0]);
    expect(activity.find((a) => a.id === crossed.id)?.contact).toBeNull();
    expect(JSON.stringify(today.body.activity)).not.toContain('segredo');
    expect(activity.length).toBeLessThanOrEqual(8);
  });

  it('relatório: exige sessão, aceita só 7, 30 ou 90 dias e mostra o próprio negócio', async () => {
    expect((await http().get('/panel/report')).status).toBe(401);
    const { cookie } = await login();
    const ok = await http().get('/panel/report').set('cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ days: 30, booked: { total: expect.any(Number) } });
    const week = await http().get('/panel/report').query({ days: 7 }).set('cookie', cookie);
    expect(week.body.days).toBe(7);
    const odd = await http().get('/panel/report').query({ days: 15 }).set('cookie', cookie);
    expect(odd.status).toBe(400);
  });

  it('rota que muda dados exige o token CSRF', async () => {
    const { cookie, csrf } = await login();
    const body = { name: 'Cliente Nova', phone: '(00) 90000-1234' };
    const without = await http().post('/panel/contacts').set('cookie', cookie).send(body);
    expect(without.status).toBe(403);
    const wrong = await http()
      .post('/panel/contacts')
      .set('cookie', cookie)
      .set('x-csrf-token', 'token-errado')
      .send(body);
    expect(wrong.status).toBe(403);
    const ok = await http()
      .post('/panel/contacts')
      .set('cookie', cookie)
      .set('x-csrf-token', csrf)
      .send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.phone).toBe('00900001234');
  });

  it('sair derruba a sessão', async () => {
    const { cookie, csrf } = await login();
    expect(
      (await http().post('/auth/logout').set('cookie', cookie).set('x-csrf-token', csrf)).status,
    ).toBe(200);
    expect((await http().get('/auth/me').set('cookie', cookie)).status).toBe(401);
  });

  it('admin nexo só entra com o código do 2FA e não acessa o painel de um negócio', async () => {
    const secret = generateTotpSecret();
    const admin = await createUser(null, 'NEXO_ADMIN', secret);
    const first = await login(admin);
    expect(first.res.status).toBe(401);
    expect(first.res.body.totpRequired).toBe(true);
    expect((await login(admin, PASSWORD, '000000')).res.status).toBe(401);

    const ok = await login(admin, PASSWORD, totpCode(secret, new Date()));
    expect(ok.res.status).toBe(200);
    expect((await http().get('/panel/today').set('cookie', ok.cookie)).status).toBe(403);
  });

  it('agenda pelo painel: marca, recusa horário ocupado, marca como realizado', async () => {
    const { cookie, csrf } = await login();
    const services = await http().get('/panel/services').set('cookie', cookie);
    const serviceId = services.body[0].id as string;
    // Próxima terça (o seed atende de terça a sábado).
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7 || 7));
    const date = d.toISOString().slice(0, 10);
    const slots = await http().get('/panel/slots').query({ serviceId, date }).set('cookie', cookie);
    expect(slots.status).toBe(200);
    const startsAt = slots.body[0].startsAt as string;

    const post = (path: string, body: object) =>
      http().post(path).set('cookie', cookie).set('x-csrf-token', csrf).send(body);
    const booked = await post('/panel/appointments', {
      contactId: t.contactIds[1],
      serviceId,
      startsAt,
    });
    expect(booked.status).toBe(201);
    expect(booked.body.source).toBe('PANEL');

    const clash = await post('/panel/appointments', {
      contactId: t.contactIds[2],
      serviceId,
      startsAt,
    });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Escolha outro');

    const done = await post(`/panel/appointments/${booked.body.id}/status`, { status: 'DONE' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('DONE');

    const agenda = await http()
      .get('/panel/agenda')
      .query({ from: date, days: 7 })
      .set('cookie', cookie);
    expect(agenda.body.appointments.map((a: { id: string }) => a.id)).toContain(booked.body.id);
  });

  it('etapas: a dona move o atendimento por toque', async () => {
    const { cookie, csrf } = await login();
    const pipeline = await http().get('/panel/pipeline').set('cookie', cookie);
    const stages = pipeline.body.stages as { id: string; name: string; deals: { id: string }[] }[];
    const deal = stages.flatMap((s) => s.deals)[0]!;
    const lost = stages.find((s) => s.name === 'Não seguiu')!;
    const moved = await http()
      .post(`/panel/deals/${deal.id}/stage`)
      .set('cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ stageId: lost.id });
    expect(moved.status).toBe(200);
    expect(moved.body.stageId).toBe(lost.id);

    // Etapa de outro negócio: recusada.
    const foreignStage = await withTenant(prisma, other.tenantId, (tx) =>
      tx.stage.findFirstOrThrow(),
    );
    const refused = await http()
      .post(`/panel/deals/${deal.id}/stage`)
      .set('cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ stageId: foreignStage.id });
    expect(refused.status).toBe(404);
  });

  it('ficha: responde a cliente (assume a conversa) e devolve para o robô', async () => {
    const { cookie, csrf } = await login();
    const conversations = app.get(ConversationService);
    const phone = `55000${Date.now().toString().slice(-8)}`;
    await conversations.handleInbound(t.tenantId, {
      channel: 'simulator',
      businessExternalId: 'sem-simulador',
      externalId: `sim-${randomUUID()}`,
      from: phone,
      type: 'text',
      input: { kind: 'text', text: 'oi' },
      body: 'oi',
      receivedAt: new Date().toISOString(),
    });
    const contact = await withTenant(prisma, t.tenantId, (tx) =>
      tx.contact.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: t.tenantId, phone } } }),
    );
    const file = await http().get(`/panel/contacts/${contact.id}`).set('cookie', cookie);
    expect(file.status).toBe(200);
    expect(file.body.deal.stage.name).toBe('Novo contato');
    const conversationId = file.body.conversations[0].id as string;
    expect(file.body.conversations[0].messages[0]).toMatchObject({
      direction: 'INBOUND',
      body: 'oi',
    });

    const reply = await http()
      .post(`/panel/conversations/${conversationId}/messages`)
      .set('cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ text: 'Oi! Aqui é a Ana.' });
    expect(reply.status).toBe(201);
    const today = await http().get('/panel/today').set('cookie', cookie);
    expect(today.body.handoffs.map((h: { conversationId: string }) => h.conversationId)).toContain(
      conversationId,
    );

    const resumed = await http()
      .post(`/panel/conversations/${conversationId}/resume`)
      .set('cookie', cookie)
      .set('x-csrf-token', csrf);
    expect(resumed.status).toBe(200);
    const after = await http().get('/panel/today').set('cookie', cookie);
    expect(
      after.body.handoffs.map((h: { conversationId: string }) => h.conversationId),
    ).not.toContain(conversationId);
  });

  it('ids malformados e campos inválidos são recusados com 400', async () => {
    const { cookie, csrf } = await login();
    expect((await http().get('/panel/contacts/nao-e-uuid').set('cookie', cookie)).status).toBe(400);
    const bad = await http()
      .post('/panel/contacts')
      .set('cookie', cookie)
      .set('x-csrf-token', csrf)
      .send({ name: 'x', phone: '123' });
    expect(bad.status).toBe(400);
  });
});
