import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { loadEnv } from '../src/config/env.js';

// Precisa de um Postgres rodando (npm run db:up, ou o serviço da CI).
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://nexo_app:nexo_app@localhost:5432/nexo',
  WEB_ORIGIN: 'http://localhost:5173',
});

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env)],
    }).compile();
    app = setupApp(moduleRef.createNestApplication({ rawBody: true, bufferLogs: true }), env);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde ok quando o banco está no ar', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('envia cabeçalhos de segurança', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('libera CORS só para o domínio do painel', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://site-malicioso.example');
    // O navegador só libera a resposta se o cabeçalho for igual à origem que pediu.
    expect(blocked.headers['access-control-allow-origin']).not.toBe(
      'https://site-malicioso.example',
    );
  });
});
