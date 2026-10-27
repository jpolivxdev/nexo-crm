import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/app.setup.js';
import { loadEnv } from '../../src/config/env.js';
import { MemoryQueue } from '../../src/queue/memory.queue.js';
import { JOB_QUEUE } from '../../src/queue/queues.js';
import { APP_SECRET, VERIFY_TOKEN } from './meta.js';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nexo_app:nexo_app@localhost:5432/nexo';
export const MIGRATION_URL =
  process.env.DATABASE_MIGRATION_URL ?? 'postgresql://nexo:nexo@localhost:5432/nexo';

export const testEnv = (overrides: Record<string, string> = {}) =>
  loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    DATABASE_URL,
    WEB_ORIGIN: 'http://localhost:5173',
    WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: APP_SECRET,
    RUN_WORKER: 'true',
    ...overrides,
  });

/** Sobe a API inteira com a fila em memória (o job roda na hora). */
export async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication; queue: MemoryQueue }> {
  const env = testEnv(overrides);
  const queue = new MemoryQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(env)] })
    .overrideProvider(JOB_QUEUE)
    .useValue(queue)
    .compile();
  const app = setupApp(moduleRef.createNestApplication({ rawBody: true, bufferLogs: true }), env);
  await app.init();
  return { app, queue };
}
