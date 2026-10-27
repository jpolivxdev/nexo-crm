import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RESET_TTL_MS } from '../src/auth/account.service.js';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient } from '../src/database/prisma.js';
import { type ConsoleMailer, MAILER } from '../src/mail/mailer.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('criar conta, confirmar e-mail e esqueci a senha', () => {
  let app: INestApplication;
  let mailer: ConsoleMailer;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false', SIGNUP_ENABLED: 'true' }));
    mailer = app.get<ConsoleMailer>(MAILER);
  });

  beforeEach(() => {
    mailer.outbox.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  // Cada chamada sai de um IP diferente, para os limites não atrapalharem os outros testes.
  const post = (path: string, body: object, ip = randomUUID()) =>
    request(app.getHttpServer()).post(path).set('x-forwarded-for', ip).send(body);

  const newEmail = () => `cadastro-${randomUUID()}@exemplo.test`;
  const signupBody = (email: string) => ({
    businessName: 'Estúdio Cadastro (demo)',
    niche: 'cilios',
    ownerName: 'Dona Cadastro',
    email,
    password: PASSWORD,
    acceptTerms: true,
  });

  /** Último link mandado para o e-mail (o token vem depois de "?token="). */
  function tokenFor(email: string): string {
    const mail = mailer.outbox.filter((m) => m.to === email).at(-1);
    const token = mail?.text.match(/\?token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`Nenhum link para ${email}`);
    return token;
  }

  async function verifiedUser() {
    const email = newEmail();
    await prisma.user.create({
      data: {
        email,
        name: 'Dona Teste',
        role: 'OWNER',
        tenantId: null,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    return email;
  }

  it('mostra o que a tela de entrada pode oferecer', async () => {
    const res = await request(app.getHttpServer()).get('/auth/options');
    expect(res.body).toEqual({ signupEnabled: true, passwordResetEnabled: true });
  });

  it('cria a conta sem confirmação, só entra depois do link e o link vale uma vez', async () => {
    const email = newEmail();
    const res = await post('/auth/signup', signupBody(email));
    expect(res.status).toBe(202);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.role).toBe('OWNER');
    expect(user.tenantId).not.toBeNull();
    // O banco guarda só o hash do link.
    const token = tokenFor(email);
    const stored = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toContain(token);

    const blocked = await post('/auth/login', { email, password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.emailNotVerified).toBe(true);
    // Senha errada continua dando o erro genérico (não revela que falta confirmar).
    expect((await post('/auth/login', { email, password: 'outra-senha-qualquer' })).status).toBe(
      401,
    );

    expect((await post('/auth/verify-email', { token })).status).toBe(200);
    expect((await post('/auth/verify-email', { token })).status).toBe(400);
    const ok = await post('/auth/login', { email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      businessName: 'Estúdio Cadastro (demo)',
      onboardingPending: true,
    });
  });

  it('e-mail que já tem conta recebe a mesma resposta, sem criar outro negócio', async () => {
    const email = await verifiedUser();
    const businessName = `Negócio Repetido ${randomUUID()} (demo)`;
    const res = await post('/auth/signup', { ...signupBody(email), businessName });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(await prisma.tenantDirectory.count({ where: { name: businessName } })).toBe(0);
    expect(mailer.outbox.at(-1)).toMatchObject({
      to: email,
      subject: 'Você já tem uma conta no painel',
    });
  });

  it('valida o cadastro: termos, senha curta, senha igual ao e-mail', async () => {
    const email = newEmail();
    const noTerms = await post('/auth/signup', { ...signupBody(email), acceptTerms: false });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.message).toContain('termos');
    const short = await post('/auth/signup', { ...signupBody(email), password: 'curta' });
    expect(short.status).toBe(400);
    const same = await post('/auth/signup', { ...signupBody(email), password: email });
    expect(same.body.message).toContain('igual ao e-mail');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('reenviar a confirmação invalida o link anterior', async () => {
    const email = newEmail();
    await post('/auth/signup', signupBody(email));
    const first = tokenFor(email);
    expect((await post('/auth/verify-email/resend', { email })).status).toBe(202);
    const second = tokenFor(email);
    expect(second).not.toBe(first);
    expect((await post('/auth/verify-email', { token: first })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: second })).status).toBe(200);
  });

  it('esqueci a senha: mesma resposta com ou sem conta, troca a senha e derruba as sessões', async () => {
    const email = await verifiedUser();
    const session = await post('/auth/login', { email, password: PASSWORD });
    const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const missing = await post('/auth/password/forgot', { email: newEmail() });
    const existing = await post('/auth/password/forgot', { email });
    expect(missing.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(missing.body).toEqual(existing.body);
    expect(mailer.outbox).toHaveLength(1);

    const token = tokenFor(email);
    const weak = await post('/auth/password/reset', { token, newPassword: 'curta' });
    expect(weak.status).toBe(400);
    // Senha fraca não gasta o link.
    const reset = await post('/auth/password/reset', {
      token,
      newPassword: 'nova-senha-bem-forte-456',
    });
    expect(reset.status).toBe(200);
    expect(
      (await post('/auth/password/reset', { token, newPassword: 'mais-uma-senha-789' })).status,
    ).toBe(400);

    expect((await request(app.getHttpServer()).get('/auth/me').set('cookie', cookie)).status).toBe(
      401,
    );
    expect((await post('/auth/login', { email, password: PASSWORD })).status).toBe(401);
    expect(
      (await post('/auth/login', { email, password: 'nova-senha-bem-forte-456' })).status,
    ).toBe(200);
  });

  it('o link de nova senha vence em 30 minutos e destrava a conta bloqueada', async () => {
    const email = await verifiedUser();
    await post('/auth/password/forgot', { email });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.authToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await post('/auth/password/reset', {
      token: tokenFor(email),
      newPassword: 'nova-senha-bem-forte-456',
    });
    expect(expired.status).toBe(400);
    expect(expired.body.message).toContain('venceu');

    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() + RESET_TTL_MS) },
    });
    await post('/auth/password/forgot', { email });
    await post('/auth/password/reset', {
      token: tokenFor(email),
      newPassword: 'nova-senha-bem-forte-456',
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after.lockedUntil).toBeNull();
    expect(
      (await post('/auth/login', { email, password: 'nova-senha-bem-forte-456' })).status,
    ).toBe(200);
  });

  it('limita pedidos de e-mail por endereço', async () => {
    const email = await verifiedUser();
    const statuses = [];
    for (let i = 0; i < 4; i++)
      statuses.push((await post('/auth/password/forgot', { email })).status);
    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('com o cadastro desligado, criar conta não existe', async () => {
    const { app: closed } = await createTestApp({ RUN_WORKER: 'false', SIGNUP_ENABLED: 'false' });
    try {
      const res = await request(closed.getHttpServer())
        .post('/auth/signup')
        .send(signupBody(newEmail()));
      expect(res.status).toBe(404);
      const options = await request(closed.getHttpServer()).get('/auth/options');
      expect(options.body.signupEnabled).toBe(false);
    } finally {
      await closed.close();
    }
  });
});
