import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AI_PROVIDER, type AiProvider, type AiRequest } from '../src/assistant/ai-provider.js';
import { scrub } from '../src/assistant/assistant.service.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { MemoryQueue } from '../src/queue/memory.queue.js';
import { JOB_QUEUE } from '../src/queue/queues.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { DATABASE_URL, testEnv } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

/** Provedor de mentira: guarda o que recebeu, nada sai da máquina. */
class FakeProvider implements AiProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  calls: AiRequest[] = [];
  generate(req: AiRequest) {
    this.calls.push(req);
    return Promise.resolve({
      text: 'Vá em **Agenda** > Marcar horário.',
      inputTokens: 120,
      outputTokens: 12,
    });
  }
}

async function build(provider: AiProvider | null, limit = '2') {
  const env = testEnv({ RUN_WORKER: 'false', NEX_DAILY_LIMIT: limit });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(env)] })
    .overrideProvider(JOB_QUEUE)
    .useValue(new MemoryQueue())
    .overrideProvider(AI_PROVIDER)
    .useValue(provider)
    .compile();
  const app = setupApp(moduleRef.createNestApplication({ rawBody: true, bufferLogs: true }), env);
  await app.init();
  return app;
}

async function owner(app: INestApplication, tenantId: string) {
  const email = `u-${randomUUID()}@exemplo.test`;
  await prisma.user.create({
    data: {
      email,
      name: 'Dona Teste',
      role: 'OWNER',
      tenantId,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .set('x-forwarded-for', randomUUID())
    .send({ email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  return { cookie, csrf: res.body.csrfToken as string };
}

describe('scrub', () => {
  it('tira telefone, CPF e e-mail, e deixa números curtos', () => {
    expect(scrub('liga pra (15) 99876-5432 ou maria@exemplo.com')).toBe(
      'liga pra [número] ou [e-mail]',
    );
    expect(scrub('CPF 123.456.789-00')).toBe('CPF [número]');
    expect(scrub('marcar às 14h por 2 dias')).toBe('marcar às 14h por 2 dias');
  });
});

describe('Nex: pergunta livre', () => {
  const fake = new FakeProvider();
  let app: INestApplication;
  let off: INestApplication;

  beforeAll(async () => {
    app = await build(fake);
    off = await build(null);
  });

  afterAll(async () => {
    await app?.close();
    await off?.close();
    await prisma.$disconnect();
  });

  it('responde só com a pergunta limpa e o manual, conta o uso e para no limite do dia', async () => {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    const other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    const s = await owner(app, t.tenantId);
    const http = () => request(app.getHttpServer());
    const ask = (question: string, history: unknown[] = []) =>
      http()
        .post('/panel/assistant')
        .set('cookie', s.cookie)
        .set('x-csrf-token', s.csrf)
        .send({ question, history });

    expect((await http().get('/panel/assistant').set('cookie', s.cookie)).body).toEqual({
      enabled: true,
      left: 2,
    });
    // Sem CSRF não passa.
    expect(
      (await http().post('/panel/assistant').set('cookie', s.cookie).send({ question: 'oi?' }))
        .status,
    ).toBe(403);
    expect((await ask('x')).status).toBe(400);

    const first = await ask('Como marco a Ana 15998765432?', [
      { role: 'user', text: 'oi' },
      { role: 'model', text: 'Oi! Em que posso ajudar?' },
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ answer: 'Vá em Agenda > Marcar horário.', left: 1 });
    const sent = fake.calls.at(-1)!;
    expect(sent.turns.at(-1)!.text).toBe('Como marco a Ana [número]?');
    expect(sent.turns).toHaveLength(3);
    expect(JSON.stringify(sent)).not.toContain(t.tenantId);

    expect((await ask('Onde vejo as faltas?')).status).toBe(200);
    const blocked = await ask('E as metas?');
    expect(blocked.status).toBe(429);
    expect(fake.calls).toHaveLength(2);

    // Registro sem texto, preso ao negócio.
    const rows = await withTenant(prisma, t.tenantId, (tx) => tx.aiUsage.findMany());
    expect(rows.map((r) => r.outcome).sort()).toEqual(['limit', 'ok', 'ok']);
    expect(rows[0]).not.toHaveProperty('question');
    expect(await withTenant(prisma, other.tenantId, (tx) => tx.aiUsage.count())).toBe(0);
  });

  it('sem chave configurada, avisa e não chama ninguém', async () => {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    const s = await owner(off, t.tenantId);
    const http = () => request(off.getHttpServer());
    expect((await http().get('/panel/assistant').set('cookie', s.cookie)).body).toEqual({
      enabled: false,
      left: 0,
    });
    const res = await http()
      .post('/panel/assistant')
      .set('cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ question: 'Como marco um horário?' });
    expect(res.status).toBe(503);
  });
});
