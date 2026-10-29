import { z } from 'zod';

/** Segredo opcional: vazio no .env conta como não configurado. */
const optionalSecret = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(16).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Papel da aplicação no Postgres: sem superusuário e sem BYPASSRLS (SEGURANCA.md, seção 3).
  DATABASE_URL: z.url(),
  // Único domínio autorizado a chamar a API pelo navegador (CORS).
  WEB_ORIGIN: z.url(),
  // WhatsApp Cloud API (oficial). Opcionais na Fase 1: sem elas o webhook recusa tudo e
  // as respostas não saem para a Meta (use o simulador). Segredos: só no .env ou no cofre.
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  WHATSAPP_APP_SECRET: optionalSecret,
  WHATSAPP_ACCESS_TOKEN: optionalSecret,
  // Chave da criptografia de campo (AES-256-GCM): 32 bytes em base64. Gere com
  // `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`. Obrigatória para o 2FA.
  FIELD_ENCRYPTION_KEY: optionalSecret,
  // Quantos proxies confiáveis ficam na frente da API (para ler o IP real em X-Forwarded-For).
  // 0 no localhost; em produção, o número de proxies do provedor (normalmente 1).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Avisos de tempo real entre processos (API, worker, simulador) pelo LISTEN/NOTIFY do Postgres.
  REALTIME_CROSS_PROCESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Produção num processo só: a API serve também o painel (build do apps/web) desta pasta,
  // e as rotas da API passam a ficar em /api (mesma origem, sem CORS). Vazio no desenvolvimento.
  WEB_DIST_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  // Cadastro pelo site ("Criar conta"). Desligado por padrão: só liga quando a nexo decidir
  // abrir o cadastro (e com o envio de e-mails configurado).
  SIGNUP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Liga o worker que processa as mensagens da fila neste processo.
  RUN_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
