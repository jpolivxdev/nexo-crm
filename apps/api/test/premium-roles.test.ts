import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { totpCode } from '../src/auth/totp.js';
import { createPrismaClient } from '../src/database/prisma.js';
import type { Role } from '../src/generated/prisma/client.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('Premium: papéis da equipe, acessos e verificação em duas etapas', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({
      RUN_WORKER: 'false',
      FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function user(tenantId: string, role: Role) {
    const email = `${role.toLowerCase()}-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: { email, name: role, role, tenantId, passwordHash: await hashPassword(PASSWORD) },
    });
    return email;
  }

  async function login(email: string, totp?: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD, ...(totp ? { totp } : {}) });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(
      ';',
    )[0];
    return { res, cookie: cookie ?? '', csrf: res.body.csrfToken as string };
  }

  type Session = Awaited<ReturnType<typeof login>>;
  const get = (s: Session, path: string) => http().get(path).set('cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'put', path: string, body: object) =>
    http()[method](path).set('cookie', s.cookie).set('x-csrf-token', s.csrf).send(body);

  async function premiumTenant() {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { plan: 'PREMIUM' } });
    return t;
  }

  it('consultor faz o dia a dia, não mexe em configurações nem na equipe; o dono decide os acessos', async () => {
    const t = await premiumTenant();
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));
    const manager = await login(await user(t.tenantId, 'MANAGER'));

    expect((await get(consultant, '/panel/contacts')).status).toBe(200);
    expect((await get(consultant, '/panel/report')).status).toBe(200);
    expect((await get(consultant, '/panel/setup')).status).toBe(403);
    expect((await get(consultant, '/panel/team')).status).toBe(403);
    expect((await get(consultant, '/panel/access')).status).toBe(403);
    expect((await get(consultant, '/auth/me')).body.access).toEqual(['reports']);

    expect((await get(manager, '/panel/setup')).status).toBe(200);
    expect((await get(manager, '/panel/team')).status).toBe(403);

    const rules = (await get(owner, '/panel/access')).body;
    expect(rules).toMatchObject({ available: true, requireMfa: false });
    rules.rules.CONSULTANT.reports = false;
    const saved = await send(owner, 'put', '/panel/access', {
      rules: rules.rules,
      requireMfa: false,
    });
    expect(saved.status).toBe(200);
    expect((await get(consultant, '/panel/report')).status).toBe(403);
    expect((await get(consultant, '/auth/me')).body.access).toEqual([]);

    // Voltou para o Básico: gestor e consultor param, nada é apagado.
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { plan: 'COMPLETE' } });
    expect((await get(manager, '/panel/contacts')).status).toBe(403);
    expect((await get(owner, '/panel/contacts')).status).toBe(200);
  });

  it('gestor e consultor só no Premium; no Básico a equipe ganha só acesso de profissional', async () => {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const team = await send(owner, 'post', '/panel/team', { name: 'Bia (demo)' });
    const bia = (team.body.professionals as { id: string; name: string }[]).find(
      (p) => p.name === 'Bia (demo)',
    )!;
    const asManager = await send(owner, 'post', `/panel/team/${bia.id}/login`, {
      email: `bia-${randomUUID()}@exemplo.test`,
      role: 'MANAGER',
    });
    expect(asManager.status).toBe(403);
    expect((await get(owner, '/panel/access')).body.available).toBe(false);

    const asStaff = await send(owner, 'post', `/panel/team/${bia.id}/login`, {
      email: `bia-${randomUUID()}@exemplo.test`,
    });
    expect(asStaff.status).toBe(201);
    const list = (await get(owner, '/panel/team')).body.professionals as {
      id: string;
      role: string | null;
    }[];
    expect(list.find((p) => p.id === bia.id)?.role).toBe('STAFF');
    expect(
      (await send(owner, 'put', `/panel/team/${bia.id}/login`, { role: 'CONSULTANT' })).status,
    ).toBe(403);
  });

  it('dono liga o 2FA, exige da equipe e o gestor sem 2FA para até ligar', async () => {
    const t = await premiumTenant();
    const ownerEmail = await user(t.tenantId, 'OWNER');
    const owner = await login(ownerEmail);
    const manager = await login(await user(t.tenantId, 'MANAGER'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));
    const rules = (await get(owner, '/panel/access')).body.rules;

    // Sem o próprio 2FA, não pode exigir dos outros.
    expect((await send(owner, 'put', '/panel/access', { rules, requireMfa: true })).status).toBe(
      400,
    );

    const start = await send(owner, 'post', '/auth/2fa/start', {});
    expect(start.body.uri).toContain('otpauth://totp/');
    const secret = start.body.secret as string;
    expect((await send(owner, 'post', '/auth/2fa/enable', { secret, code: '000000' })).status).toBe(
      400,
    );
    const enabled = await send(owner, 'post', '/auth/2fa/enable', {
      secret,
      code: totpCode(secret, new Date()),
    });
    expect(enabled.body.twoFactor).toBe(true);
    expect((await send(owner, 'put', '/panel/access', { rules, requireMfa: true })).status).toBe(
      200,
    );

    const blocked = await get(manager, '/panel/contacts');
    expect(blocked.status).toBe(403);
    expect(blocked.body.mfaRequired).toBe(true);
    expect((await get(manager, '/auth/me')).body.mfaSetupRequired).toBe(true);
    expect((await get(consultant, '/panel/contacts')).status).toBe(200);

    // Entrar agora pede o código; desligar enquanto o negócio exige é recusado.
    const noCode = await login(ownerEmail);
    expect(noCode.res.status).toBe(401);
    expect(noCode.res.body.totpRequired).toBe(true);
    const withCode = await login(ownerEmail, totpCode(secret, new Date()));
    expect(withCode.res.status).toBe(200);
    expect(
      (
        await send(withCode, 'post', '/auth/2fa/disable', {
          code: totpCode(secret, new Date()),
        })
      ).status,
    ).toBe(400);

    const audit = await prisma.$queryRaw<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE tenant_id = ${t.tenantId}::uuid ORDER BY created_at`;
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['mfa.enabled', 'access.updated']),
    );
  });
});
