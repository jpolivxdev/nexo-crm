import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

/** Produção num processo só: painel na raiz, API em /api (WEB_DIST_DIR). */
describe('API servindo o painel', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexo-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Painel do negócio</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    ({ app } = await createTestApp({ RUN_WORKER: 'false', WEB_DIST_DIR: dir }));
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('entrega o painel com CSP que só aceita a própria origem', async () => {
    const res = await http().get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Painel do negócio');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('arquivos com hash ficam em cache; outra rota cai no painel', async () => {
    const asset = await http().get('/assets/app-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const other = await http().get('/qualquer-coisa');
    expect(other.text).toContain('Painel do negócio');
  });

  it('a API fica em /api, com a CSP fechada de sempre', async () => {
    const res = await http().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    // Rota da API que não existe responde 404 em JSON, não o painel.
    const missing = await http().get('/api/nao-existe');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toContain('application/json');
    // Sem sessão, o painel recusa também em /api.
    expect((await http().get('/api/panel/today')).status).toBe(401);
  });
});
