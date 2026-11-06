import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptField } from '../src/auth/field-crypto.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCode } from '../src/auth/totp.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const FIELD_KEY = randomBytes(32).toString('base64');
const PASSWORD = 'senha-de-teste-forte-123';

async function createUser(tenantId: string | null, role: 'OWNER' | 'NEXO_ADMIN', totp?: string) {
  const email = `u-${randomUUID()}@exemplo.test`;
  await prisma.user.create({
    data: {
      email,
      name: role === 'OWNER' ? 'Dona Teste' : 'JP (nexo)',
      role,
      tenantId,
      passwordHash: await hashPassword(PASSWORD),
      totpSecretEnc: totp ? encryptField(totp, FIELD_KEY) : null,
    },
  });
  return email;
}

describe('suporte: chamados do negócio para a nexo', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let other: DemoTenant;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false', FIELD_ENCRYPTION_KEY: FIELD_KEY }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function login(email: string, totp?: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD, ...(totp ? { totp } : {}) });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0];
    return { cookie: cookie?.split(';')[0] ?? '', csrf: res.body.csrfToken as string };
  }

  it('a dona abre, a nexo responde, a dona vê a resposta e o outro negócio não vê nada', async () => {
    const owner = await login(await createUser(t.tenantId, 'OWNER'));
    const otherOwner = await login(await createUser(other.tenantId, 'OWNER'));
    const secret = generateTotpSecret();
    const admin = await login(
      await createUser(null, 'NEXO_ADMIN', secret),
      totpCode(secret, new Date()),
    );

    const bad = await http()
      .post('/panel/support')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ topic: 'duvida', subject: 'x', description: 'curto' });
    expect(bad.status).toBe(400);

    const opened = await http()
      .post('/panel/support')
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({
        topic: 'problema',
        subject: 'Lembrete não chegou',
        description: 'A cliente disse que não recebeu o lembrete de ontem.',
      });
    expect(opened.status).toBe(201);
    expect(opened.body.status).toBe('OPEN');
    const id = opened.body.id as string;

    // Outro negócio: não lista e não abre.
    const theirs = await http().get('/panel/support').set('cookie', otherOwner.cookie);
    expect(theirs.body.map((x: { id: string }) => x.id)).not.toContain(id);
    expect((await http().get(`/panel/support/${id}`).set('cookie', otherOwner.cookie)).status).toBe(
      404,
    );
    // Direto no banco, preso ao outro negócio: o RLS esconde.
    const hidden = await withTenant(prisma, other.tenantId, (tx) =>
      tx.supportTicket.findUnique({ where: { id } }),
    );
    expect(hidden).toBeNull();

    // A dona não entra no painel de suporte da nexo.
    expect((await http().get('/admin/support').set('cookie', owner.cookie)).status).toBe(403);

    // Painel da nexo: vê o chamado com o nome do negócio e responde.
    const inbox = await http().get('/admin/support?status=OPEN').set('cookie', admin.cookie);
    expect(inbox.status).toBe(200);
    const row = inbox.body.tickets.find((x: { id: string }) => x.id === id);
    expect(row).toMatchObject({ tenantName: expect.any(String), subject: 'Lembrete não chegou' });
    const answered = await http()
      .post(`/admin/support/${id}/messages`)
      .set('cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ body: 'Oi! Já olhamos: o número da cliente estava sem o DDD.' });
    expect(answered.status).toBe(201);
    expect(answered.body.status).toBe('ANSWERED');

    expect((await http().get('/panel/support/unread').set('cookie', owner.cookie)).body).toEqual({
      count: 1,
    });
    const seen = await http().get(`/panel/support/${id}`).set('cookie', owner.cookie);
    expect(seen.body.messages.map((m: { authorType: string }) => m.authorType)).toEqual([
      'owner',
      'nexo',
    ]);
    expect((await http().get('/panel/support/unread').set('cookie', owner.cookie)).body).toEqual({
      count: 0,
    });

    // Escrever de novo reabre; encerrar fecha.
    const again = await http()
      .post(`/panel/support/${id}/messages`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .send({ body: 'Obrigada! Aconteceu de novo hoje.' });
    expect(again.body.status).toBe('OPEN');
    const closed = await http()
      .post(`/panel/support/${id}/close`)
      .set('cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf);
    expect(closed.body.status).toBe('CLOSED');
    const late = await http()
      .post(`/admin/support/${id}/messages`)
      .set('cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ body: 'Mais alguma coisa?' });
    expect(late.status).toBe(409);
  });
});
