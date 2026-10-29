import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import type { MemoryQueue } from '../src/queue/memory.queue.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL, MIGRATION_URL } from './support/app.js';
import { metaWebhook, sign, textMessage, VERIFY_TOKEN } from './support/meta.js';

const prisma = createPrismaClient(DATABASE_URL);
const admin = new pg.Client({ connectionString: MIGRATION_URL });

describe('webhook da WhatsApp Cloud API', () => {
  let app: INestApplication;
  let queue: MemoryQueue;
  let t: DemoTenant;
  let phoneNumberId: string;

  beforeAll(async () => {
    ({ app, queue } = await createTestApp({ RUN_WORKER: 'false' }));
    await admin.connect();
  });

  beforeEach(async () => {
    queue.jobs.length = 0;
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, new Date('2031-01-01T12:00:00Z'));
    phoneNumberId = String(randomInt(1e9, 9e9));
    await admin.query(
      `INSERT INTO channel_routes (channel, external_id, tenant_id) VALUES ('whatsapp', $1, $2)`,
      [phoneNumberId, t.tenantId],
    );
  });

  afterAll(async () => {
    await app?.close();
    await admin.end();
    await prisma.$disconnect();
  });

  const post = (body: unknown, signature?: string) => {
    const raw = JSON.stringify(body);
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature ?? sign(raw))
      .send(raw);
  };

  it('responde a verificação da Meta só com o token certo', async () => {
    const ok = await request(app.getHttpServer()).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('1158201444');

    const wrong = await request(app.getHttpServer()).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token-errado-qualquer-000',
      'hub.challenge': '1158201444',
    });
    expect(wrong.status).toBe(403);

    const script = await request(app.getHttpServer()).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '<script>alert(1)</script>',
    });
    expect(script.status).toBe(403);
  });

  it('enfileira a mensagem para o negócio dono do número', async () => {
    const res = await post(metaWebhook(phoneNumberId, [textMessage('oi')]));
    expect(res.status).toBe(200);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toMatchObject({
      tenantId: t.tenantId,
      message: { from: '5500900000001', input: { kind: 'text', text: 'oi' } },
    });
  });

  it('recusa assinatura inválida sem enfileirar nada', async () => {
    const body = metaWebhook(phoneNumberId, [textMessage('oi')]);
    const res = await post(body, sign(JSON.stringify(body), 'segredo-de-um-atacante-0'));
    expect(res.status).toBe(401);
    const missing = await request(app.getHttpServer()).post('/webhooks/whatsapp').send(body);
    expect(missing.status).toBe(401);
    expect(queue.jobs).toEqual([]);
  });

  it('barra quem insiste em assinatura errada (429 depois de 20 tentativas)', async () => {
    const body = metaWebhook(phoneNumberId, [textMessage('oi')]);
    const forged = sign(JSON.stringify(body), 'segredo-de-um-atacante-0');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await post(body, forged).set('x-forwarded-for', '203.0.113.77');
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    // Outro IP segue recebendo 401 normal, e a Meta (assinatura certa) não é afetada.
    expect((await post(body, forged).set('x-forwarded-for', '203.0.113.78')).status).toBe(401);
    expect((await post(body).set('x-forwarded-for', '203.0.113.77')).status).toBe(200);
  });

  it('ignora enxurrada de uma cliente só (mais de 30 por minuto) e confirma para a Meta', async () => {
    const batch = (n: number, from: string) =>
      metaWebhook(
        phoneNumberId,
        Array.from({ length: n }, (_, i) => textMessage(`oi ${i}`, from)),
      );
    expect((await post(batch(20, '5500900000009'))).status).toBe(200);
    expect((await post(batch(15, '5500900000009'))).status).toBe(200);
    expect(queue.jobs).toHaveLength(30);
    // Outra cliente do mesmo negócio continua sendo atendida.
    expect((await post(batch(1, '5500900000008'))).status).toBe(200);
    expect(queue.jobs).toHaveLength(31);
  });

  it('ignora número sem negócio ligado e formato inesperado', async () => {
    expect((await post(metaWebhook('999', [textMessage('oi')]))).status).toBe(200);
    expect((await post({ object: 'outra-coisa' })).status).toBe(200);
    expect(queue.jobs).toEqual([]);
  });

  it('atualiza a situação de entrega sem voltar atrás', async () => {
    const message = await withTenant(prisma, t.tenantId, async (tx) => {
      const conversation = await tx.conversation.create({
        data: { tenantId: t.tenantId, contactId: t.contactIds[0]!, channel: 'whatsapp' },
      });
      return tx.message.create({
        data: {
          tenantId: t.tenantId,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          externalId: `wamid.OUT${phoneNumberId}`,
          type: 'text',
          body: 'oi',
          status: 'sent',
        },
      });
    });
    await post(metaWebhook(phoneNumberId, [], [{ id: message.externalId, status: 'read' }]));
    await post(metaWebhook(phoneNumberId, [], [{ id: message.externalId, status: 'delivered' }]));
    const after = await withTenant(prisma, t.tenantId, (tx) =>
      tx.message.findUniqueOrThrow({ where: { id: message.id } }),
    );
    expect(after.status).toBe('read');
  });
});

describe('webhook sem o segredo do app configurado', () => {
  it('recusa tudo', async () => {
    const { app } = await createTestApp({ WHATSAPP_APP_SECRET: '' });
    const raw = JSON.stringify(metaWebhook('1', [textMessage('oi')]));
    const res = await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw);
    expect(res.status).toBe(503);
    await app.close();
  });
});
