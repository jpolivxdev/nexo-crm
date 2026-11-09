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

describe('Premium: chat interno', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function user(tenantId: string, role: Role, name?: string) {
    const email = `${role.toLowerCase()}-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: {
        email,
        name: `${name ?? role} (demo)`,
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

  type ChatList = {
    channels: { id: string; name: string; general: boolean; unread: number }[];
    directs: { id: string; name: string; withUserId: string; unread: number }[];
    people: { id: string; name: string }[];
    unread: number;
  };

  it('no Básico o chat fica fechado', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/chat')).status).toBe(403);
  });

  it('canal Geral, canais novos, mensagens, não lidas e mensagem apagada', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER', 'Dona'));
    const staff = await login(await user(t.tenantId, 'STAFF', 'Profissional'));

    const first = (await get(owner, '/panel/chat')).body as ChatList;
    const again = (await get(staff, '/panel/chat')).body as ChatList;
    expect(first.channels.filter((c) => c.general)).toHaveLength(1);
    expect(again.channels.map((c) => c.id)).toEqual(first.channels.map((c) => c.id));
    const geral = first.channels[0]!.id;

    const sent = await send(owner, 'post', `/panel/chat/${geral}/messages`, {
      body: '  Bom dia!  ',
    });
    expect(sent.status).toBe(201);
    expect(
      (await send(owner, 'post', `/panel/chat/${geral}/messages`, { body: '   ' })).status,
    ).toBe(400);

    let list = (await get(staff, '/panel/chat')).body as ChatList;
    expect(list.unread).toBe(1);
    const page = await get(staff, `/panel/chat/${geral}/messages`);
    expect(page.body.messages.map((m: { body: string }) => m.body)).toEqual(['Bom dia!']);
    expect(page.body.messages[0].authorName).toBe('Dona (demo)');
    list = (await get(staff, '/panel/chat')).body as ChatList;
    expect(list.unread).toBe(0);

    // Só quem escreveu apaga; o texto sai e a mensagem fica.
    const id = sent.body.id as string;
    expect((await send(staff, 'delete', `/panel/chat/${geral}/messages/${id}`)).status).toBe(403);
    expect((await send(owner, 'delete', `/panel/chat/${geral}/messages/${id}`)).status).toBe(200);
    const after = await get(staff, `/panel/chat/${geral}/messages`);
    expect(after.body.messages[0]).toMatchObject({ body: null, deleted: true });

    const created = await send(staff, 'post', '/panel/chat/channels', { name: 'Recepção' });
    expect(created.status).toBe(201);
    expect((await send(owner, 'post', '/panel/chat/channels', { name: 'recepção' })).status).toBe(
      400,
    );
    expect((await send(owner, 'post', `/panel/chat/channels/${geral}/archive`)).status).toBe(400);
    expect(
      (await send(owner, 'post', `/panel/chat/channels/${created.body.id}/archive`)).status,
    ).toBe(200);
    list = (await get(owner, '/panel/chat')).body as ChatList;
    expect(list.channels.map((c) => c.name)).toEqual(['Geral']);
  });

  it('conversa direta é só das duas pessoas', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER', 'Dona'));
    const manager = await login(await user(t.tenantId, 'MANAGER', 'Gestora'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT', 'Consultora'));

    const dm = await send(owner, 'post', '/panel/chat/direct', { userId: manager.userId });
    expect(dm.status).toBe(200);
    const same = await send(manager, 'post', '/panel/chat/direct', { userId: owner.userId });
    expect(same.body.id).toBe(dm.body.id);
    expect((await send(owner, 'post', '/panel/chat/direct', { userId: owner.userId })).status).toBe(
      400,
    );

    await send(manager, 'post', `/panel/chat/${dm.body.id}/messages`, { body: 'Oi, tudo certo?' });
    const ownerList = (await get(owner, '/panel/chat')).body as ChatList;
    expect(ownerList.directs).toHaveLength(1);
    expect(ownerList.directs[0]).toMatchObject({ name: 'Gestora (demo)', unread: 1 });

    // A terceira pessoa não vê nem escreve.
    const third = (await get(consultant, '/panel/chat')).body as ChatList;
    expect(third.directs).toHaveLength(0);
    expect((await get(consultant, `/panel/chat/${dm.body.id}/messages`)).status).toBe(404);
    expect(
      (await send(consultant, 'post', `/panel/chat/${dm.body.id}/messages`, { body: 'oi' })).status,
    ).toBe(404);
  });

  it('nada vaza entre negócios', async () => {
    const a = await tenant('PREMIUM');
    const b = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${b.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: b.tenantId }, data: { plan: 'PREMIUM' } });
    const ownerA = await login(await user(a.tenantId, 'OWNER'));
    const ownerB = await login(await user(b.tenantId, 'OWNER'));
    const geralA = ((await get(ownerA, '/panel/chat')).body as ChatList).channels[0]!.id;
    await send(ownerA, 'post', `/panel/chat/${geralA}/messages`, { body: 'Só do negócio A' });

    const listB = (await get(ownerB, '/panel/chat')).body as ChatList;
    expect(listB.channels[0]!.id).not.toBe(geralA);
    expect(listB.unread).toBe(0);
    expect((await get(ownerB, `/panel/chat/${geralA}/messages`)).status).toBe(404);
    expect(
      (await send(ownerB, 'post', '/panel/chat/direct', { userId: ownerA.userId })).status,
    ).toBe(404);
  });
});
