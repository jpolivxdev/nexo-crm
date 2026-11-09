import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createPrismaClient } from '../src/database/prisma.js';
import type { Role } from '../src/generated/prisma/client.js';
import { createDemoTenant, DEMO_TENANTS } from '../src/seed/demo-tenant.js';
import { createTestApp, DATABASE_URL } from './support/app.js';

const prisma = createPrismaClient(DATABASE_URL);
const PASSWORD = 'senha-de-teste-forte-123';

describe('Premium: CRM completo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ RUN_WORKER: 'false' }));
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  async function user(tenantId: string, role: Role) {
    const email = `${role.toLowerCase()}-${randomUUID()}@exemplo.test`;
    await prisma.user.create({
      data: {
        email,
        name: `${role} (demo)`,
        role,
        tenantId,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    return email;
  }

  async function login(email: string) {
    const res = await http()
      .post('/auth/login')
      .set('x-forwarded-for', randomUUID())
      .send({ email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(
      ';',
    )[0];
    const me = await http()
      .get('/auth/me')
      .set('cookie', cookie ?? '');
    return { cookie: cookie ?? '', csrf: res.body.csrfToken as string, userId: me.body.userId };
  }

  type Session = Awaited<ReturnType<typeof login>>;
  const get = (s: Session, path: string) => http().get(path).set('cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'put' | 'delete', path: string, body: object = {}) =>
    http()[method](path).set('cookie', s.cookie).set('x-csrf-token', s.csrf).send(body);

  async function tenant(plan: 'PREMIUM' | 'COMPLETE') {
    const t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${t.tenantId}, false)`;
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { plan } });
    return t;
  }

  it('no Básico o CRM completo fica fechado; o quadro simples continua', async () => {
    const t = await tenant('COMPLETE');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    expect((await get(owner, '/panel/crm/pipelines')).status).toBe(403);
    expect((await send(owner, 'post', '/panel/crm/pipelines', { name: 'Noivas' })).status).toBe(
      403,
    );
    expect((await get(owner, '/panel/pipeline')).status).toBe(200);
  });

  it('funis, novo atendimento com dono, campanha, campos, previsão e exportação', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));

    // Funil novo nasce com o modelo padrão e as chances de cada etapa.
    const created = await send(owner, 'post', '/panel/crm/pipelines', { name: 'Noivas (demo)' });
    expect(created.status).toBe(201);
    const pipelines = (await get(owner, '/panel/crm/pipelines')).body as {
      id: string;
      isDefault: boolean;
      stages: { id: string; name: string; kind: string; probability: number | null }[];
    }[];
    expect(pipelines).toHaveLength(2);
    const noivas = pipelines.find((p) => p.id === created.body.id)!;
    expect(noivas.isDefault).toBe(false);
    expect(noivas.stages[0]).toMatchObject({ name: 'Novo contato', probability: 10 });

    // Consultor não mexe na estrutura (área Configurações), mas trabalha no quadro.
    expect((await send(consultant, 'post', '/panel/crm/pipelines', { name: 'X' })).status).toBe(
      403,
    );
    expect(
      (await send(consultant, 'post', '/panel/crm/fields', { label: 'X', type: 'text' })).status,
    ).toBe(403);

    const field = await send(owner, 'post', '/panel/crm/fields', {
      label: 'Tipo de evento',
      type: 'select',
      options: ['Casamento', 'Formatura'],
    });
    expect(field.status).toBe(201);
    const campaign = await send(owner, 'post', '/panel/crm/campaigns', {
      name: 'Noivas de verão (demo)',
      channel: 'Instagram',
      pipelineId: noivas.id,
      startsOn: '2026-11-10',
      endsOn: '2026-12-20',
      budgetCents: 30000,
    });
    expect(campaign.status).toBe(201);

    const deal = await send(consultant, 'post', '/panel/crm/deals', {
      name: 'Carla (demo)',
      phone: '5515900001111',
      pipelineId: noivas.id,
      stageId: noivas.stages[2]!.id,
      title: 'Pacote noiva',
      valueCents: 80000,
      campaignId: campaign.body.id,
      expectedCloseOn: '2026-12-05',
      fields: { [field.body.id]: 'Casamento' },
    });
    expect(deal.status).toBe(201);
    // Uma cliente, um atendimento em aberto por funil.
    expect(
      (
        await send(consultant, 'post', '/panel/crm/deals', {
          name: 'Carla (demo)',
          phone: '5515900001111',
          pipelineId: noivas.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send(owner, 'put', `/panel/crm/deals/${deal.body.id}`, {
          fields: { [field.body.id]: 'Aniversário' },
        })
      ).status,
    ).toBe(400);

    const board = (await get(owner, `/panel/pipeline?pipelineId=${noivas.id}`)).body;
    expect(board.isDefault).toBe(false);
    const card = board.stages[2].deals[0];
    expect(card).toMatchObject({
      title: 'Pacote noiva',
      valueCents: 80000,
      ownValue: true,
      owner: { id: consultant.userId },
      campaign: { name: 'Noivas de verão (demo)' },
      expectedCloseOn: '2026-12-05',
      fields: { [field.body.id]: 'Casamento' },
    });
    // Orçamento tem 50% de chance no modelo: R$ 800 em aberto, R$ 400 na previsão.
    expect(board.forecast).toMatchObject({ count: 1, openCents: 80000, weightedCents: 40000 });
    expect(board.forecast.byMonth[0]).toMatchObject({ month: '2026-12' });

    // Novo atendimento fora do funil principal não cria cartão no principal.
    const main = (await get(owner, '/panel/pipeline')).body;
    const inMain = main.stages.flatMap((s: { deals: { contact: { name: string } }[] }) =>
      s.deals.map((d) => d.contact.name),
    );
    expect(inMain).not.toContain('Carla (demo)');

    // Campanha conta os atendimentos.
    const campaigns = (await get(owner, '/panel/crm/campaigns')).body;
    expect(campaigns[0]).toMatchObject({ deals: 1, pipeline: { id: noivas.id } });

    // Exportar: só com a área de privacidade (consultor não tem por padrão); fica na auditoria.
    expect((await get(consultant, `/panel/crm/export.csv?pipelineId=${noivas.id}`)).status).toBe(
      403,
    );
    const csv = await get(owner, `/panel/crm/export.csv?pipelineId=${noivas.id}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Cliente;Telefone;Atendimento;Etapa');
    expect(csv.text).toContain('Carla (demo);5515900001111;Pacote noiva;Orçamento;800,00');
    expect(csv.text).toContain('Tipo de evento');
    const audit = await prisma.auditLog.findMany({
      where: { tenantId: t.tenantId, action: 'crm.exported' },
    });
    expect(audit).toHaveLength(1);

    // Etapa com atendimento não sai; funil com atendimento não é apagado; o padrão nunca.
    const keep = noivas.stages.filter((_, i) => i !== 2);
    const remove = await send(owner, 'put', `/panel/crm/pipelines/${noivas.id}`, {
      name: 'Noivas (demo)',
      stages: keep.map(({ id, name, kind, probability }) => ({ id, name, kind, probability })),
    });
    expect(remove.status).toBe(409);
    expect((await send(owner, 'delete', `/panel/crm/pipelines/${noivas.id}`)).status).toBe(409);
    const def = pipelines.find((p) => p.isDefault)!;
    expect((await send(owner, 'delete', `/panel/crm/pipelines/${def.id}`)).status).toBe(409);

    // Renomear etapa, mudar chance e acrescentar uma etapa nova.
    const renamed = await send(owner, 'put', `/panel/crm/pipelines/${noivas.id}`, {
      name: 'Noivas 2027 (demo)',
      stages: [
        ...noivas.stages.slice(0, 4).map(({ id, name, kind }, i) => ({
          id,
          name: i === 2 ? 'Proposta enviada' : name,
          kind,
          probability: i === 2 ? 60 : null,
        })),
        { name: 'Prova marcada', kind: 'OPEN', probability: 80 },
        ...noivas.stages.slice(4).map(({ id, name, kind, probability }) => ({
          id,
          name,
          kind,
          probability,
        })),
      ],
    });
    expect(renamed.status).toBe(200);
    const after = (await get(owner, `/panel/pipeline?pipelineId=${noivas.id}`)).body;
    expect(after.name).toBe('Noivas 2027 (demo)');
    expect(after.stages.map((s: { name: string }) => s.name)).toContain('Prova marcada');
    expect(after.forecast.weightedCents).toBe(48000);
  });

  it('tarefas com responsável: as minhas, as da equipe e nada de outro negócio', async () => {
    const t = await tenant('PREMIUM');
    const owner = await login(await user(t.tenantId, 'OWNER'));
    const consultant = await login(await user(t.tenantId, 'CONSULTANT'));
    const other = await tenant('PREMIUM');
    const outsider = await login(await user(other.tenantId, 'OWNER'));

    const mine = await send(consultant, 'post', '/panel/crm/tasks', {
      title: 'Ligar para confirmar a prova',
      kind: 'call',
      dueAt: '2026-11-20T13:00:00.000Z',
      contactId: t.contactIds[0],
    });
    expect(mine.status).toBe(201);
    const forOwner = await send(consultant, 'post', '/panel/crm/tasks', {
      title: 'Reunião sobre o pacote',
      kind: 'meeting',
      assigneeUserId: owner.userId,
    });
    expect(forOwner.status).toBe(201);
    // Responsável de outro negócio é recusado.
    expect(
      (
        await send(consultant, 'post', '/panel/crm/tasks', {
          title: 'X',
          assigneeUserId: outsider.userId,
        })
      ).status,
    ).toBe(400);

    const consultantTasks = (await get(consultant, '/panel/crm/tasks')).body;
    expect(consultantTasks.map((x: { title: string }) => x.title)).toEqual([
      'Ligar para confirmar a prova',
    ]);
    const ownerTasks = (await get(owner, '/panel/crm/tasks')).body;
    expect(ownerTasks.map((x: { title: string }) => x.title)).toContain('Reunião sobre o pacote');
    expect(ownerTasks.map((x: { title: string }) => x.title)).not.toContain(
      'Ligar para confirmar a prova',
    );
    const all = (await get(owner, '/panel/crm/tasks?scope=all')).body;
    expect(all.length).toBeGreaterThanOrEqual(2);

    expect((await send(consultant, 'post', `/panel/tasks/${mine.body.id}/done`)).status).toBe(200);
    const done = (await get(consultant, '/panel/crm/tasks?done=true')).body;
    expect(done[0]).toMatchObject({ id: mine.body.id, assignee: { id: consultant.userId } });
    expect((await send(consultant, 'post', `/panel/crm/tasks/${mine.body.id}/reopen`)).status).toBe(
      200,
    );

    // Outro negócio não enxerga as tarefas.
    const leaked = (await get(outsider, '/panel/crm/tasks?scope=all')).body;
    expect(leaked.map((x: { id: string }) => x.id)).not.toContain(mine.body.id);
  });
});
