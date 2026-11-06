import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('configurações: meu perfil e segurança', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function login(email: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    return { cookie, csrf: res.body.csrfToken as string };
  }

  it('troca o nome, mostra os outros aparelhos e sai deles sem derrubar este', async () => {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    const email = `u-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'Dona Teste',
        role: 'OWNER',
        tenantId: t.tenantId,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    const phone = await login(email);
    const laptop = await login(email);

    const before = await http().get('/auth/profile').set('cookie', laptop.cookie);
    expect(before.body).toEqual({
      name: 'Dona Teste',
      email,
      twoFactor: false,
      otherSessions: 1,
    });

    // Sem CSRF não muda; nome curto é recusado.
    expect(
      (await http().post('/auth/profile').set('cookie', laptop.cookie).send({ name: 'Ana' }))
        .status,
    ).toBe(403);
    const short = await http()
      .post('/auth/profile')
      .set('cookie', laptop.cookie)
      .set('x-csrf-token', laptop.csrf)
      .send({ name: 'A' });
    expect(short.status).toBe(400);

    const saved = await http()
      .post('/auth/profile')
      .set('cookie', laptop.cookie)
      .set('x-csrf-token', laptop.csrf)
      .send({ name: '  Ana Souza  ' });
    expect(saved.body).toEqual({ name: 'Ana Souza', email });
    expect((await http().get('/auth/me').set('cookie', laptop.cookie)).body.name).toBe('Ana Souza');

    const revoked = await http()
      .post('/auth/sessions/revoke-others')
      .set('cookie', laptop.cookie)
      .set('x-csrf-token', laptop.csrf);
    expect(revoked.body).toEqual({ revoked: 1 });
    expect((await http().get('/auth/me').set('cookie', phone.cookie)).status).toBe(401);
    expect((await http().get('/auth/me').set('cookie', laptop.cookie)).status).toBe(200);

    const audit = await withTenant(prisma, t.tenantId, (tx) =>
      tx.auditLog.findMany({
        where: { action: { in: ['profile.updated', 'sessions.revoked'] } },
        select: { action: true },
      }),
    );
    expect(audit.map((a) => a.action).sort()).toEqual(['profile.updated', 'sessions.revoked']);
  });
});
