import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // rawBody: a assinatura dos webhooks da Meta é validada sobre o corpo bruto.
  const app = await NestFactory.create(AppModule.register(env), {
    rawBody: true,
    bufferLogs: true,
  });
  setupApp(app, env);
  await app.listen(env.PORT);
}

void bootstrap();
