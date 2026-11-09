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
const DAY = 86_400_000;

describe('Premium: importar, exportar e Carteira de clientes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function login(tenantId: string, role: Role) {
    const email = `${role.toLowerCase()}-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: { email, name: role, role, tenantId, passwordHash: await hashPassword(PASSWORD) },
    });
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    return { cookie, csrf: res.body.csrfToken as string };
  }

  type Session = Awaited<ReturnType<typeof login>>;
  const get = (s: Session, path: string) => http().get(path).set('cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'put', path: string, body: object) =>
    http()[method](path).set('cookie', s.cookie).set('x-csrf-token', s.csrf).send(body);

  async function tenant(plan: 'PREMIUM' | 'COMPLETE') {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { plan } });
    return t;
  }

  it('no Básico importar e Carteira ficam fechados', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(t.tenantId, 'OWNER');
    expect((await get(owner, '/panel/crm/portfolio')).status).toBe(403);
    expect(
      (await send(owner, 'post', '/panel/crm/contacts/import/check', { csv: 'a;b' })).status,
    ).toBe(403);
  });

  it('confere antes de salvar, não duplica pelo telefone e exporta com auditoria', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(t.tenantId, 'OWNER');
    const consultant = await login(t.tenantId, 'CONSULTANT');
    const known = await prisma.contact.findFirstOrThrow({ where: { tenantId: t.tenantId } });

    const csv = [
      'Nome;Telefone;Etiquetas',
      'Lia (demo);(15) 91111-0001;indicação',
      'Mel (demo);15 91111-0002;',
      'Lia de novo;15911110001;',
      `${known.name ?? 'Conhecida'};${known.phone};vip`,
      'Sem telefone;abc;',
    ].join('\n');

    // Consultor não tem a área de dados pessoais por padrão.
    expect(
      (await send(consultant, 'post', '/panel/crm/contacts/import/check', { csv })).status,
    ).toBe(403);

    const check = await send(owner, 'post', '/panel/crm/contacts/import/check', { csv });
    expect(check.status).toBe(200);
    expect(check.body.summary).toEqual({ total: 5, new: 2, existing: 1, duplicate: 1, invalid: 1 });
    // Conferir não salva nada.
    expect(await prisma.contact.count({ where: { tenantId: t.tenantId, source: 'IMPORT' } })).toBe(
      0,
    );

    const saved = await send(owner, 'post', '/panel/crm/contacts/import', {
      csv,
      updateExisting: true,
    });
    expect(saved.body).toEqual({ created: 2, updated: 1, skipped: 2 });
    const lia = await prisma.contact.findFirstOrThrow({
      where: { tenantId: t.tenantId, phone: '5515911110001' },
      include: { deals: true },
    });
    expect(lia).toMatchObject({ name: 'Lia (demo)', source: 'IMPORT', tags: ['indicação'] });
    expect(lia.deals).toHaveLength(1);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: known.id } })).tags).toContain(
      'vip',
    );

    // Importar de novo não duplica.
    const again = await send(owner, 'post', '/panel/crm/contacts/import', { csv });
    expect(again.body.created).toBe(0);

    const out = await get(owner, '/panel/crm/contacts/export.csv');
    expect(out.status).toBe(200);
    expect(out.text).toContain('Nome;Telefone;Etiquetas;Origem');
    expect(out.text).toContain('Lia (demo);5515911110001;indicação;Planilha');
    const actions = (
      await prisma.auditLog.findMany({ where: { tenantId: t.tenantId }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['contacts.imported', 'contacts.exported']));
  });

  it('Carteira: em dia, atenção, risco e perdida, e o dono muda os dias', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(t.tenantId, 'OWNER');
    const consultant = await login(t.tenantId, 'CONSULTANT');
    const now = Date.now();
    // Dados direto no banco, presos ao negócio (RLS) numa transação só.
    const contacts = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`;
      const list = [];
      for (const [i, name] of ['Ok (demo)', 'Risco (demo)', 'Perdida (demo)'].entries()) {
        list.push(
          await tx.contact.create({
            data: { tenantId: t.tenantId, name, phone: `55159222200${i}`, source: 'PANEL' },
          }),
        );
      }
      const done = (contactId: string, daysAgo: number) =>
        tx.appointment.create({
          data: {
            tenantId: t.tenantId,
            contactId,
            serviceId: t.serviceIds[0]!,
            professionalId: t.professionalId,
            startsAt: new Date(now - daysAgo * DAY),
            endsAt: new Date(now - daysAgo * DAY + 3_600_000),
            status: 'DONE',
            source: 'PANEL',
          },
        });
      await done(list[0]!.id, 10);
      await done(list[0]!.id, 31);
      await done(list[1]!.id, 60);
      await done(list[2]!.id, 120);
      return list;
    });
    expect(contacts).toHaveLength(3);

    const res = await get(consultant, '/panel/crm/portfolio');
    expect(res.status).toBe(200);
    const byName = (n: string) =>
      (res.body.clients as { name: string; status: string; visits: number }[]).find(
        (c) => c.name === n,
      );
    expect(byName('Ok (demo)')).toMatchObject({ status: 'ok', visits: 2, avgIntervalDays: 21 });
    expect(byName('Risco (demo)')?.status).toBe('risk');
    expect(byName('Perdida (demo)')?.status).toBe('lost');
    expect(res.body.rules).toEqual({ attentionDays: 30, riskDays: 45, lostDays: 90 });

    // Regras: consultor não muda; fora de ordem é recusado; o dono muda.
    const rules = { attentionDays: 30, riskDays: 70, lostDays: 150 };
    expect((await send(consultant, 'put', '/panel/crm/portfolio/rules', rules)).status).toBe(403);
    expect(
      (
        await send(owner, 'put', '/panel/crm/portfolio/rules', {
          attentionDays: 80,
          riskDays: 70,
          lostDays: 150,
        })
      ).status,
    ).toBe(400);
    expect((await send(owner, 'put', '/panel/crm/portfolio/rules', rules)).status).toBe(200);
    const after = await get(owner, '/panel/crm/portfolio');
    const status = (n: string) =>
      (after.body.clients as { name: string; status: string }[]).find((c) => c.name === n)?.status;
    expect(status('Risco (demo)')).toBe('attention');
    expect(status('Perdida (demo)')).toBe('risk');
  });
});
