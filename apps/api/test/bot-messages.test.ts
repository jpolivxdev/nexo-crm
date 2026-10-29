import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';
import { ownerSession } from './support/owner.js';

const prisma = createPrismaClient(DATABASE_URL);

describe('mensagens do robô editadas pela dona', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let other: DemoTenant;
  let owner: Awaited<ReturnType<typeof ownerSession>>;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    owner = await ownerSession(app, prisma, t.tenantId);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const stored = (tenantId: string) =>
    withTenant(prisma, tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { botMessages: true } }),
    ).then((r) => r.botMessages);

  it('mostra cada mensagem com o padrão, as variáveis e o limite', async () => {
    const res = await owner.get('/panel/setup/messages');
    expect(res.status).toBe(200);
    const confirm = res.body.messages.find((m: { key: string }) => m.key === 'confirm');
    expect(confirm).toMatchObject({
      custom: null,
      variables: ['servico', 'data', 'hora'],
      max: 1024,
      button: false,
    });
    const button = res.body.messages.find((m: { key: string }) => m.key === 'menuBook');
    expect(button).toMatchObject({ max: 20, button: true });
  });

  it('salva só o que mudou, só no próprio negócio, e vazio volta ao padrão', async () => {
    const res = await owner.put('/panel/setup/messages', {
      messages: { menu: 'O que você precisa?', chooseService: '' },
    });
    expect(res.status).toBe(200);
    expect(await stored(t.tenantId)).toEqual({ menu: 'O que você precisa?' });
    expect(await stored(other.tenantId)).toEqual({});

    await owner.put('/panel/setup/messages', { messages: {} });
    expect(await stored(t.tenantId)).toEqual({});
  });

  it('recusa e diz qual mensagem está errada', async () => {
    const res = await owner.put('/panel/setup/messages', {
      messages: { menu: 'Ok', privacyNotice: 'Oi, aqui é o {negocio}.' },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ key: 'privacyNotice' });
    expect(res.body.message).toContain('parar');
    expect(await stored(t.tenantId)).toEqual({});
  });
});
