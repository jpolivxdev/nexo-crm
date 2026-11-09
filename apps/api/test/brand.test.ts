import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient } from '../src/database/prisma.js';
import type { Role } from '../src/generated/prisma/client.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { DnsLookup } from '../src/brand/brand.service.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('Premium: marca, domínio e modelos', () => {
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
  const logo = (s: Session, data: Buffer, name: string) =>
    http()
      .post('/panel/brand/logo')
      .set('cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('content-type', 'application/octet-stream')
      .set('x-file-name', encodeURIComponent(name))
      .send(data);

  it('no Básico marca e modelos ficam fechados', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/brand')).status).toBe(403);
    expect((await get(owner, '/panel/templates')).status).toBe(403);
    expect((await get(owner, '/auth/me')).body.brand).toBeNull();
  });

  it('cor com contraste, fonte e logo aparecem no painel', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const staff = await login(await user(t.tenantId, 'STAFF'));

    expect((await send(owner, 'put', '/panel/brand', { color: '#FFD700' })).status).toBe(400);
    const saved = await send(owner, 'put', '/panel/brand', { color: '#0f766e', font: 'classica' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ color: '#0F766E', font: 'classica', logoVersion: null });

    expect((await logo(owner, Buffer.from('<svg/>'), 'logo.svg')).status).toBe(400);
    expect((await logo(owner, PNG, 'logo.png')).status).toBe(200);
    const me = await get(staff, '/auth/me');
    expect(me.body.brand).toMatchObject({ color: '#0F766E', font: 'classica' });
    expect(me.body.brand.logoVersion).toEqual(expect.any(Number));
    const img = await get(staff, '/panel/brand/logo');
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');

    // Profissional não muda a marca.
    expect((await send(staff, 'put', '/panel/brand', { color: '#100C24' })).status).toBe(403);
  });

  it('domínio próprio: código no DNS, verificação e login com a marca', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const domain = `painel-${randomUUID().slice(0, 8)}.exemplo.test`;
    const set = await send(owner, 'put', '/panel/brand/domain', { domain: `https://${domain}/` });
    expect(set.status).toBe(200);
    expect(set.body.domain).toMatchObject({
      name: domain,
      verified: false,
      txtName: `_nexo-verificacao.${domain}`,
    });
    const token = set.body.domain.txtValue as string;
    expect(token).toMatch(/^nexo-[0-9a-f]{32}$/);

    // Antes de verificar, o login no domínio não mostra a marca.
    expect((await http().get('/public/brand').set('host', domain)).body).toEqual({ brand: null });

    const dns = app.get(DnsLookup);
    dns.txt = async () => [['outro-codigo']];
    expect((await send(owner, 'post', '/panel/brand/domain/verify')).status).toBe(400);
    dns.txt = async (name: string) => (name === `_nexo-verificacao.${domain}` ? [[token]] : []);
    const ok = await send(owner, 'post', '/panel/brand/domain/verify');
    expect(ok.status).toBe(200);
    expect(ok.body.domain.verified).toBe(true);

    await send(owner, 'put', '/panel/brand', { color: '#B4235A' });
    const pub = await http().get('/public/brand').set('host', domain);
    expect(pub.body.brand).toMatchObject({ name: 'Estúdio Exemplo (demo)', color: '#B4235A' });

    // O mesmo endereço não entra em outro negócio.
    const other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${other.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: other.tenantId }, data: { plan: 'PREMIUM' } });
    const ownerB = await login(await user(other.tenantId, 'OWNER'));
    expect((await send(ownerB, 'put', '/panel/brand/domain', { domain })).status).toBe(409);
    expect((await send(ownerB, 'put', '/panel/brand/domain', { domain: 'localhost' })).status).toBe(
      400,
    );
  });

  it('modelos: campos conhecidos, e-mail com assunto, arquivar e isolamento', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));
    const wa = await send(owner, 'post', '/panel/templates', {
      channel: 'whatsapp',
      name: 'Confirmar horário',
      body: 'Oi, {primeiro_nome}! Confirmando {servico} {data} às {hora}.',
    });
    expect(wa.status).toBe(201);
    expect(
      (
        await send(owner, 'post', '/panel/templates', {
          channel: 'whatsapp',
          name: 'Erro',
          body: 'Oi {nme}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(owner, 'post', '/panel/templates', {
          channel: 'email',
          name: 'Sem assunto',
          body: 'Oi',
        })
      ).status,
    ).toBe(400);
    await send(owner, 'post', '/panel/templates', {
      channel: 'email',
      name: 'Boas-vindas',
      subject: 'Bem-vinda ao {negocio}',
      body: 'Oi, {nome}!',
    });

    const all = await get(consultant, '/panel/templates');
    expect(all.body.map((x: { name: string }) => x.name)).toEqual([
      'Boas-vindas',
      'Confirmar horário',
    ]);
    expect((await get(consultant, '/panel/templates?channel=whatsapp')).body).toHaveLength(1);

    expect((await send(owner, 'post', `/panel/templates/${wa.body.id}/archive`)).status).toBe(200);
    expect((await get(owner, '/panel/templates?channel=whatsapp')).body).toHaveLength(0);

    const other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${other.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: other.tenantId }, data: { plan: 'PREMIUM' } });
    const ownerB = await login(await user(other.tenantId, 'OWNER'));
    expect((await get(ownerB, '/panel/templates')).body).toEqual([]);
    expect(
      (
        await send(ownerB, 'put', `/panel/templates/${wa.body.id}`, {
          channel: 'whatsapp',
          name: 'X do B',
          body: 'oi',
        })
      ).status,
    ).toBe(404);
  });
});
