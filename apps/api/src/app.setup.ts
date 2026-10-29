import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { RateLimiter } from './auth/rate-limiter.js';
import type { Env } from './config/env.js';

/** A API só devolve JSON: nada pode carregar dela. */
const apiHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
});

/**
 * Painel: só arquivos da própria origem. `style-src-attr 'unsafe-inline'` só para atributos
 * style (largura das barras); nenhum script inline.
 */
const webHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
});

/**
 * Configuração comum à aplicação real e aos testes, para os testes
 * exercitarem os mesmos cabeçalhos e regras de CORS (SEGURANCA.md, seção 6).
 */
export function setupApp(app: INestApplication, env: Env): INestApplication {
  app.useLogger(app.get(Logger));
  const express = app as NestExpressApplication;
  express.set('trust proxy', env.TRUST_PROXY);
  app.use(rateLimit(env.RATE_LIMIT_PER_MINUTE, Boolean(env.WEB_DIST_DIR)));
  if (env.WEB_DIST_DIR) {
    serveWeb(express, resolve(env.WEB_DIST_DIR));
  } else {
    app.use(apiHeaders);
  }
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  return app;
}

/**
 * Limite geral por IP, em memória (Fase 1 tem um servidor só; SEGURANCA.md, seção 3, item 10).
 * Fica fora o POST do webhook da Meta: lá a assinatura é conferida e há limites por contato e
 * por negócio. Com o painel servido junto, só as rotas da API contam.
 */
function rateLimit(perMinute: number, apiUnderPrefix: boolean) {
  const limiter = new RateLimiter(perMinute, 60_000);
  return (req: Request, res: Response, next: NextFunction) => {
    const path = apiUnderPrefix ? req.path.replace(/^\/api(?=\/|$)/, '') : req.path;
    if (apiUnderPrefix && path === req.path) return next();
    if (req.method === 'POST' && path === '/webhooks/whatsapp') return next();
    if (limiter.take(req.ip ?? 'desconhecido')) return next();
    res.setHeader('Retry-After', '60');
    res.status(429).json({
      statusCode: 429,
      message: 'Muitas tentativas. Espere um minuto e tente de novo.',
    });
  };
}

/** Um processo só: painel na raiz, API em /api. O painel usa rotas com #, então basta o index. */
function serveWeb(app: NestExpressApplication, dir: string): void {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) throw new Error(`WEB_DIST_DIR sem index.html: ${dir}`);
  const isApi = (req: Request) => req.path === '/api' || req.path.startsWith('/api/');

  app.setGlobalPrefix('api');
  app.use((req: Request, res: Response, next: NextFunction) =>
    isApi(req) ? apiHeaders(req, res, next) : webHeaders(req, res, next),
  );
  app.useStaticAssets(dir, {
    index: 'index.html',
    setHeaders: (res, path) => {
      // Arquivos com hash no nome podem ficar em cache; o resto sempre revalida.
      res.setHeader(
        'Cache-Control',
        path.includes(`${join(dir, 'assets')}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || isApi(req)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
