import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

describe('limite geral de pedidos por IP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RATE_LIMIT_PER_MINUTE: '10', RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (ip: string) =>
    request(app.getHttpServer()).get('/health').set('x-forwarded-for', ip);

  it('responde 429 depois do limite, só para aquele IP', async () => {
    for (let i = 0; i < 10; i += 1) expect((await get('198.51.100.1')).status).toBe(200);
    const blocked = await get('198.51.100.1');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('60');
    expect(blocked.body.message).toContain('Espere um minuto');
    expect((await get('198.51.100.2')).status).toBe(200);
  });

  it('não conta o webhook da Meta, que tem limites próprios', async () => {
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('x-forwarded-for', '198.51.100.3')
        .send({});
      expect(res.status).toBe(401);
    }
    expect((await get('198.51.100.3')).status).toBe(200);
  });
});
