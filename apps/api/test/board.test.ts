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

describe('Premium: quadro branco', () => {
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

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const raw = (s: Session, method: 'put' | 'post', path: string, data: Buffer, name?: string) => {
    const base = method === 'put' ? http().put(path) : http().post(path);
    const r = base
      .set('cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('content-type', 'application/octet-stream');
    if (name) r.set('x-file-name', encodeURIComponent(name));
    return r.send(data);
  };
  const save = (s: Session, id: string, body: object) =>
    raw(s, 'put', `/panel/boards/${id}`, Buffer.from(JSON.stringify(body)));
  const rect = (id: string) => ({
    id,
    type: 'rect',
    x: 10,
    y: 10,
    w: 100,
    h: 60,
    color: '#6A1FE8',
    width: 2,
    fill: false,
  });

  it('no Básico o quadro fica fechado', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/boards')).status).toBe(403);
  });

  it('cria, desenha, salva com versão e avisa quando alguém salvou antes', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER', 'Dona'));
    const staff = await login(await user(t.tenantId, 'STAFF', 'Profissional'));

    const created = await send(staff, 'post', '/panel/boards', { title: 'Ideias de vitrine' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const open = await get(owner, `/panel/boards/${id}`);
    expect(open.body).toMatchObject({ title: 'Ideias de vitrine', elements: [], version: 1 });

    const saved = await save(owner, id, { elements: [rect('r1')], version: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ version: 2 });

    // A profissional ainda estava na versão 1: não apaga o que a dona fez.
    const stale = await save(staff, id, { elements: [], version: 1 });
    expect(stale.status).toBe(409);
    expect((await get(staff, `/panel/boards/${id}`)).body).toMatchObject({
      version: 2,
      updatedByName: 'Dona (demo)',
      elements: [rect('r1')],
    });

    // Conferência dos desenhos e tamanho grande (mais que o limite do JSON comum).
    expect(
      (await save(owner, id, { elements: [{ ...rect('x'), color: '#ff0000' }], version: 2 }))
        .status,
    ).toBe(400);
    const pen = {
      id: 'p1',
      type: 'pen',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      color: '#100C24',
      width: 2,
      points: Array.from({ length: 8000 }, (_, i) => [i, i % 50]),
    };
    expect((await save(owner, id, { elements: [rect('r1'), pen], version: 2 })).status).toBe(200);

    const list = await get(staff, '/panel/boards');
    expect(list.body.boards[0]).toMatchObject({ id, count: 2, canArchive: true });
    expect(list.body.boards[0].preview).toHaveLength(2);

    expect(
      (await send(staff, 'put', `/panel/boards/${id}/title`, { title: 'Vitrine de natal' })).status,
    ).toBe(200);
    expect((await get(owner, `/panel/boards/${id}`)).body.title).toBe('Vitrine de natal');
  });

  it('imagem: só do próprio quadro e só imagem de verdade', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const a = (await send(owner, 'post', '/panel/boards', { title: 'Quadro A' })).body.id as string;
    const b = (await send(owner, 'post', '/panel/boards', { title: 'Quadro B' })).body.id as string;

    const file = await raw(owner, 'post', `/panel/boards/${a}/files`, PNG, 'foto.png');
    expect(file.status).toBe(201);
    expect(
      (await raw(owner, 'post', `/panel/boards/${a}/files`, Buffer.from('%PDF-1.7'), 'a.pdf'))
        .status,
    ).toBe(400);
    expect(
      (await raw(owner, 'post', `/panel/boards/${a}/files`, Buffer.from('<svg/>'), 'a.svg')).status,
    ).toBe(400);

    const img = {
      id: 'i1',
      type: 'image',
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      color: '#100C24',
      fileId: file.body.id,
    };
    expect((await save(owner, a, { elements: [img], version: 1 })).status).toBe(200);
    expect((await save(owner, b, { elements: [img], version: 1 })).status).toBe(400);

    const shown = await get(owner, `/panel/boards/files/${file.body.id}`);
    expect(shown.status).toBe(200);
    expect(shown.headers['content-type']).toBe('image/png');
    expect(shown.headers['x-content-type-options']).toBe('nosniff');
  });

  it('arquivar é de quem criou, da dona ou do gestor', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const staff = await login(await user(t.tenantId, 'STAFF'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));
    const id = (await send(owner, 'post', '/panel/boards', { title: 'Da dona' })).body.id as string;
    expect((await get(staff, '/panel/boards')).body.boards[0].canArchive).toBe(false);
    expect((await send(consultant, 'post', `/panel/boards/${id}/archive`)).status).toBe(403);
    expect((await send(owner, 'post', `/panel/boards/${id}/archive`)).status).toBe(200);
    expect((await get(staff, `/panel/boards/${id}`)).status).toBe(404);
  });

  it('nada vaza entre negócios', async () => {
    const a = await tenant('PREMIUM');
    const b = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${b.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: b.tenantId }, data: { plan: 'PREMIUM' } });
    const ownerA = await login(await user(a.tenantId, 'OWNER'));
    const ownerB = await login(await user(b.tenantId, 'OWNER'));
    const id = (await send(ownerA, 'post', '/panel/boards', { title: 'Só do A' })).body
      .id as string;
    const file = await raw(ownerA, 'post', `/panel/boards/${id}/files`, PNG, 'a.png');

    expect((await get(ownerB, '/panel/boards')).body.boards).toEqual([]);
    expect((await get(ownerB, `/panel/boards/${id}`)).status).toBe(404);
    expect((await save(ownerB, id, { elements: [], version: 1 })).status).toBe(404);
    expect((await get(ownerB, `/panel/boards/files/${file.body.id}`)).status).toBe(404);
    expect((await raw(ownerB, 'post', `/panel/boards/${id}/files`, PNG, 'b.png')).status).toBe(404);
  });
});
