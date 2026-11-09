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

describe('Premium: Wiki', () => {
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
  const upload = (s: Session, articleId: string, name: string, data: Buffer) =>
    http()
      .post(`/panel/wiki/articles/${articleId}/attachments`)
      .set('cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('content-type', 'application/octet-stream')
      .set('x-file-name', encodeURIComponent(name))
      .send(data);

  it('no Básico a Wiki fica fechada', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/wiki')).status).toBe(403);
  });

  it('dona escreve, organiza em categorias e busca; a equipe só lê', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER', 'Dona'));
    const staff = await login(await user(t.tenantId, 'STAFF', 'Profissional'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT', 'Consultora'));

    const cat = await send(owner, 'post', '/panel/wiki/categories', { name: 'Procedimentos' });
    expect(cat.status).toBe(201);
    expect(
      (await send(owner, 'post', '/panel/wiki/categories', { name: 'procedimentos' })).status,
    ).toBe(400);

    const art = await send(owner, 'post', '/panel/wiki/articles', {
      title: 'Higiene das pinças',
      body: '## Depois de cada cliente\n- Lavar as **pinças**\n- Guardar na caixa',
      categoryId: cat.body.id,
    });
    expect(art.status).toBe(201);
    await send(owner, 'post', '/panel/wiki/articles', {
      title: 'Abrir o estúdio',
      body: 'Ligar o ar e conferir as pinças.',
      pinned: true,
    });

    const all = await get(staff, '/panel/wiki');
    expect(all.status).toBe(200);
    expect(all.body.canEdit).toBe(false);
    expect(all.body.total).toBe(2);
    expect(all.body.articles[0].title).toBe('Abrir o estúdio'); // fixado vem primeiro
    expect(all.body.categories).toEqual([{ id: cat.body.id, name: 'Procedimentos', count: 1 }]);

    // Busca: título com o termo vem antes; trecho sem marcação.
    const found = await get(staff, '/panel/wiki?q=pinças');
    expect(found.body.articles.map((a: { title: string }) => a.title)).toEqual([
      'Higiene das pinças',
      'Abrir o estúdio',
    ]);
    expect(found.body.articles[0].excerpt).toContain('Lavar as pinças');
    const byCat = await get(staff, `/panel/wiki?categoryId=${cat.body.id}`);
    expect(byCat.body.articles).toHaveLength(1);

    // Profissional e consultora não escrevem.
    for (const s of [staff, consultant]) {
      expect((await send(s, 'post', '/panel/wiki/articles', { title: 'Teste' })).status).toBe(403);
      expect(
        (await send(s, 'put', `/panel/wiki/articles/${art.body.id}`, { title: 'Outro título' }))
          .status,
      ).toBe(403);
    }

    const edited = await send(owner, 'put', `/panel/wiki/articles/${art.body.id}`, {
      title: 'Higiene das pinças e da bancada',
      body: 'Texto novo',
      categoryId: cat.body.id,
    });
    expect(edited.status).toBe(200);
    const one = await get(staff, `/panel/wiki/articles/${art.body.id}`);
    expect(one.body).toMatchObject({
      title: 'Higiene das pinças e da bancada',
      updatedByName: 'Dona (demo)',
    });

    // Tirar a categoria não some com o artigo.
    expect((await send(owner, 'delete', `/panel/wiki/categories/${cat.body.id}`)).status).toBe(200);
    expect((await get(staff, `/panel/wiki/articles/${art.body.id}`)).body.categoryId).toBeNull();

    // Arquivar tira da lista.
    expect((await send(owner, 'post', `/panel/wiki/articles/${art.body.id}/archive`)).status).toBe(
      200,
    );
    expect((await get(staff, `/panel/wiki/articles/${art.body.id}`)).status).toBe(404);
    expect((await get(staff, '/panel/wiki')).body.total).toBe(1);
  });

  it('anexos: confere o tipo pelo conteúdo, imagem abre e o resto baixa', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const staff = await login(await user(t.tenantId, 'STAFF'));
    const art = await send(owner, 'post', '/panel/wiki/articles', { title: 'Termo de cuidado' });

    const img = await upload(owner, art.body.id, 'bancada.png', PNG);
    expect(img.status).toBe(201);
    expect(img.body).toMatchObject({ name: 'bancada.png', image: true });
    const pdf = await upload(
      owner,
      art.body.id,
      'termo assinado.pdf',
      Buffer.from('%PDF-1.7 teste'),
    );
    expect(pdf.status).toBe(201);
    expect((await upload(owner, art.body.id, 'falso.png', Buffer.from('%PDF-1.7'))).status).toBe(
      400,
    );
    expect((await upload(owner, art.body.id, 'pagina.html', Buffer.from('<script>'))).status).toBe(
      400,
    );
    expect((await upload(staff, art.body.id, 'b.png', PNG)).status).toBe(403);

    const shown = await get(staff, `/panel/wiki/attachments/${img.body.id}`);
    expect(shown.status).toBe(200);
    expect(shown.headers['content-type']).toBe('image/png');
    expect(shown.headers['content-disposition']).toMatch(/^inline/);
    expect(shown.headers['x-content-type-options']).toBe('nosniff');
    const down = await get(staff, `/panel/wiki/attachments/${pdf.body.id}`);
    expect(down.headers['content-disposition']).toBe(
      "attachment; filename*=UTF-8''termo%20assinado.pdf",
    );

    const meta = await get(staff, `/panel/wiki/articles/${art.body.id}`);
    expect(meta.body.attachments.map((a: { name: string }) => a.name)).toEqual([
      'bancada.png',
      'termo assinado.pdf',
    ]);
    expect((await get(staff, '/panel/wiki')).body.usage.bytes).toBe(PNG.length + 14);

    expect((await send(owner, 'delete', `/panel/wiki/attachments/${pdf.body.id}`)).status).toBe(
      200,
    );
    expect((await get(staff, `/panel/wiki/attachments/${pdf.body.id}`)).status).toBe(404);
  });

  it('nada vaza entre negócios', async () => {
    const a = await tenant('PREMIUM');
    const b = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${b.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: b.tenantId }, data: { plan: 'PREMIUM' } });
    const ownerA = await login(await user(a.tenantId, 'OWNER'));
    const ownerB = await login(await user(b.tenantId, 'OWNER'));
    const art = await send(ownerA, 'post', '/panel/wiki/articles', { title: 'Só do negócio A' });
    const file = await upload(ownerA, art.body.id, 'a.png', PNG);
    const cat = await send(ownerA, 'post', '/panel/wiki/categories', { name: 'Do A' });

    expect((await get(ownerB, '/panel/wiki')).body.total).toBe(0);
    expect((await get(ownerB, `/panel/wiki/articles/${art.body.id}`)).status).toBe(404);
    expect((await get(ownerB, `/panel/wiki/attachments/${file.body.id}`)).status).toBe(404);
    expect(
      (await send(ownerB, 'put', `/panel/wiki/articles/${art.body.id}`, { title: 'Do negócio B' }))
        .status,
    ).toBe(404);
    expect(
      (
        await send(ownerB, 'post', '/panel/wiki/articles', {
          title: 'Do negócio B',
          categoryId: cat.body.id,
        })
      ).status,
    ).toBe(400);
    expect((await upload(ownerB, art.body.id, 'b.png', PNG)).status).toBe(404);
  });
});
