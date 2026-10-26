import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Papel da aplicação no Postgres: sem superusuário e sem BYPASSRLS (SEGURANCA.md, seção 3).
  DATABASE_URL: z.url(),
  // Único domínio autorizado a chamar a API pelo navegador (CORS).
  WEB_ORIGIN: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Lê e valida as variáveis de ambiente. Falha na subida se faltar algo,
 * sem imprimir os valores (podem conter segredos).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${fields}. Veja .env.example.`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
