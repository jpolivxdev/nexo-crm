import type { Params } from 'nestjs-pino';
import type { Env } from './config/env.js';

/**
 * Logs sem segredos e sem dado pessoal desnecessário (SEGURANCA.md, seção 9).
 * Telefones são mascarados com maskPhone(@nexo/core) onde forem registrados.
 */
export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-hub-signature-256"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[oculto]',
      },
      // Não registra corpo de requisição: pode ter mensagens de clientes.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
