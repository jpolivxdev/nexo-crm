import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://nexo_app:senha@localhost:5432/nexo',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('aceita configuração mínima e aplica padrões', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('falha listando só os nomes das variáveis, sem expor valores', () => {
    const secret = 'postgresql://nexo_app:segredo-que-nao-pode-vazar';
    expect(() => loadEnv({ DATABASE_URL: secret })).toThrow(/WEB_ORIGIN/);
    try {
      loadEnv({ DATABASE_URL: 'nao-e-url-segredo', WEB_ORIGIN: 'x' });
    } catch (error) {
      expect(String(error)).not.toContain('segredo');
    }
  });
});
