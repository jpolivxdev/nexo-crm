import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashPassword } from '../../src/auth/password.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

const PASSWORD = 'senha-de-teste-forte-123';

/** Cria a dona do negócio, entra e devolve atalhos de GET/POST/PUT/DELETE já com cookie e CSRF. */
export async function ownerSession(app: INestApplication, prisma: PrismaClient, tenantId: string) {
  const email = `dona-${randomUUID()}@exemplo.test`;
  await prisma.user.create({
    data: {
      email,
      name: 'Dona Teste',
      role: 'OWNER',
      tenantId,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  const http = () => request(app.getHttpServer());
  const res = await http()
    .post('/auth/login')
    .set('x-forwarded-for', randomUUID())
    .send({ email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  const csrf = res.body.csrfToken as string;
  const write = (method: 'post' | 'put' | 'delete' | 'patch', path: string, body?: object) =>
    http()[method](path).set('cookie', cookie).set('x-csrf-token', csrf).send(body);
  return {
    get: (path: string) => http().get(path).set('cookie', cookie),
    post: (path: string, body?: object) => write('post', path, body),
    put: (path: string, body?: object) => write('put', path, body),
    patch: (path: string, body?: object) => write('patch', path, body),
    del: (path: string) => write('delete', path),
  };
}
