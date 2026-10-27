import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env.js';

/**
 * Configuração comum à aplicação real e aos testes, para os testes
 * exercitarem os mesmos cabeçalhos e regras de CORS (SEGURANCA.md, seção 6).
 */
export function setupApp(app: INestApplication, env: Env): INestApplication {
  app.useLogger(app.get(Logger));
  (app as NestExpressApplication).set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  return app;
}
