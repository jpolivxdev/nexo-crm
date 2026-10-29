import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';
const HOUR = 60 * 60 * 1000;

describe('exportar e excluir os dados de uma cliente (LGPD)', () => {
  let app: INestApplication;
  let t: DemoTenant;
  let other: DemoTenant;
  let session: { cookie: string; csrf: string };
  let contactId: string;
  let futureId: string;
  let pastId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    other = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
    const email = `dona-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'Dona Teste',
        role: 'OWNER',
        tenantId: t.tenantId,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD });
    session = {
      cookie: (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!,
      csrf: res.body.csrfToken as string,
    };

    // Cliente fictícia com conversa, horário passado, horário futuro com lembrete e "a fazer".
    ({ contactId, futureId, pastId } = await withTenant(prisma, t.tenantId, async (tx) => {
      const contact = await tx.contact.create({
        data: {
          tenantId: t.tenantId,
          name: 'Cliente Exclusão (demo)',
          phone: `5500977${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          notes: 'Prefere de manhã',
          tags: ['frequente'],
          source: 'WHATSAPP',
        },
      });
      const conversation = await tx.conversation.create({
        data: { tenantId: t.tenantId, contactId: contact.id, channel: 'simulator' },
      });
      await tx.message.createMany({
        data: [
          {
            tenantId: t.tenantId,
            conversationId: conversation.id,
            direction: 'INBOUND',
            type: 'text',
            body: 'Oi, quero marcar',
          },
          {
            tenantId: t.tenantId,
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            type: 'text',
            body: 'Claro! Qual serviço?',
          },
        ],
      });
      const base = {
        tenantId: t.tenantId,
        contactId: contact.id,
        serviceId: t.serviceIds[0]!,
        professionalId: t.professionalId,
        source: 'WHATSAPP' as const,
      };
      const past = await tx.appointment.create({
        data: {
          ...base,
          startsAt: new Date(Date.now() - 72 * HOUR),
          endsAt: new Date(Date.now() - 71 * HOUR),
          status: 'DONE',
          notes: 'Veio com a filha',
        },
      });
      const future = await tx.appointment.create({
        data: {
          ...base,
          startsAt: new Date(Date.now() + 500 * HOUR),
          endsAt: new Date(Date.now() + 501 * HOUR),
        },
      });
      await tx.reminder.create({
        data: {
          tenantId: t.tenantId,
          appointmentId: future.id,
          kind: 'BEFORE_24H',
          sendAt: new Date(Date.now() + 476 * HOUR),
        },
      });
      await tx.task.create({
        data: {
          tenantId: t.tenantId,
          contactId: contact.id,
          title: 'Chamar a Cliente Exclusão de volta',
        },
      });
      await tx.event.create({
        data: {
          tenantId: t.tenantId,
          type: 'contact.created',
          entityType: 'contact',
          entityId: contact.id,
          actorType: 'contact',
          actorId: contact.id,
          payload: { contactId: contact.id },
        },
      });
      return { contactId: contact.id, futureId: future.id, pastId: past.id };
    }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(path).set('cookie', session.cookie);
  const post = (path: string, body: object) =>
    http().post(path).set('cookie', session.cookie).set('x-csrf-token', session.csrf).send(body);

  it('exporta tudo o que o negócio guarda sobre a cliente e registra na auditoria', async () => {
    const res = await get(`/panel/contacts/${contactId}/export`);
    expect(res.status).toBe(200);
    expect(res.body.contact).toMatchObject({
      name: 'Cliente Exclusão (demo)',
      notes: 'Prefere de manhã',
      tags: ['frequente'],
    });
    expect(res.body.conversations[0].messages.map((m: { body: string }) => m.body)).toEqual([
      'Oi, quero marcar',
      'Claro! Qual serviço?',
    ]);
    expect(res.body.appointments).toHaveLength(2);
    expect(res.body.appointments[0]).toMatchObject({ status: 'DONE', notes: 'Veio com a filha' });
    expect(typeof res.body.appointments[0].service).toBe('string');
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.history.map((h: { type: string }) => h.type)).toContain('contact.created');
    // Nada de IDs internos do negócio no arquivo.
    expect(JSON.stringify(res.body)).not.toContain(t.tenantId);

    const audit = await withTenant(prisma, t.tenantId, (tx) =>
      tx.auditLog.findMany({ where: { action: 'contact.export' } }),
    );
    expect(audit.map((a) => (a.metadata as { contactId: string }).contactId)).toContain(contactId);
  });

  it('exclui: apaga dados pessoais e conversas, libera o horário futuro e mantém o registro anônimo', async () => {
    expect((await post(`/panel/contacts/${contactId}/erase`, {})).status).toBe(400);

    const res = await post(`/panel/contacts/${contactId}/erase`, { confirm: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cancelledAppointments: 1, deletedMessages: 2 });

    await withTenant(prisma, t.tenantId, async (tx) => {
      const contact = await tx.contact.findUniqueOrThrow({ where: { id: contactId } });
      expect(contact).toMatchObject({ name: null, notes: null, tags: [] });
      expect(contact.phone).not.toMatch(/^\d+$/);
      expect(contact.erasedAt).not.toBeNull();
      expect(await tx.conversation.count({ where: { contactId } })).toBe(0);
      expect(await tx.message.count({ where: { body: 'Oi, quero marcar' } })).toBe(0);
      expect(await tx.task.count({ where: { contactId } })).toBe(0);
      // O horário passado continua contando nos relatórios, sem a anotação.
      const past = await tx.appointment.findUniqueOrThrow({ where: { id: pastId } });
      expect(past).toMatchObject({ status: 'DONE', notes: null });
      const future = await tx.appointment.findUniqueOrThrow({
        where: { id: futureId },
        include: { reminders: true },
      });
      expect(future.status).toBe('CANCELLED');
      expect(future.reminders.every((r) => r.status === 'CANCELLED')).toBe(true);
      expect(await tx.deal.count({ where: { contactId, closedAt: null } })).toBe(0);
      expect(await tx.event.count({ where: { type: 'contact.erased', entityId: contactId } })).toBe(
        1,
      );
      const audit = await tx.auditLog.findMany({ where: { action: 'contact.erase' } });
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0]!.metadata)).not.toContain('Cliente Exclusão');
    });

    // Some do painel: lista, ficha, exportar e marcar horário.
    const list = await get('/panel/contacts');
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(contactId);
    expect((await get(`/panel/contacts/${contactId}`)).status).toBe(404);
    expect((await get(`/panel/contacts/${contactId}/export`)).status).toBe(404);
    expect((await post(`/panel/contacts/${contactId}/erase`, { confirm: true })).status).toBe(404);
  });

  it('não exporta nem exclui cliente de outro negócio', async () => {
    const foreign = other.contactIds[0]!;
    expect((await get(`/panel/contacts/${foreign}/export`)).status).toBe(404);
    expect((await post(`/panel/contacts/${foreign}/erase`, { confirm: true })).status).toBe(404);
    const still = await withTenant(prisma, other.tenantId, (tx) =>
      tx.contact.findUniqueOrThrow({ where: { id: foreign } }),
    );
    expect(still.erasedAt).toBeNull();
  });

  it('exige sessão e token CSRF', async () => {
    expect((await http().get(`/panel/contacts/${contactId}/export`)).status).toBe(401);
    const noCsrf = await http()
      .post(`/panel/contacts/${contactId}/erase`)
      .set('cookie', session.cookie)
      .send({ confirm: true });
    expect(noCsrf.status).toBe(403);
  });
});
