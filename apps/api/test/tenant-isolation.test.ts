import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient, withTenant } from '../src/database/prisma.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';

// Roda contra o Postgres real com o papel da aplicação (nexo_app), como em produção.
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nexo_app:nexo_app@localhost:5432/nexo';

// Delegates do Prisma de todas as tabelas com tenant_id.
const TENANT_MODELS = [
  'professional',
  'service',
  'professionalService',
  'availability',
  'timeOff',
  'appointment',
  'reminder',
  'contact',
  'consent',
  'conversation',
  'message',
  'pipeline',
  'stage',
  'deal',
  'task',
  'event',
] as const;

type Finder = { findMany: (args?: object) => Promise<{ tenantId: string }[]> };

describe('isolamento entre negócios (RLS)', () => {
  let prisma: PrismaClient;
  let a: DemoTenant;
  let b: DemoTenant;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    a = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
    b = await createDemoTenant(prisma, DEMO_TENANTS[1]!);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('a aplicação não roda como superusuário nem pode pular o RLS', async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('toda tabela com tenant_id tem RLS ligado, forçado e com política', async () => {
    const tables = await prisma.$queryRaw<{ table: string; ok: boolean }[]>`
      SELECT c.relname AS table,
             (c.relrowsecurity AND c.relforcerowsecurity
              AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)) AS ok
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
        -- users: login acontece antes de saber o negócio (SEGURANCA.md, seção 3).
        AND c.relname <> 'users'`;
    expect(tables.length).toBeGreaterThanOrEqual(TENANT_MODELS.length);
    expect(tables.filter((t) => !t.ok).map((t) => t.table)).toEqual([]);
  });

  it('sem negócio definido, nenhuma linha de negócio aparece', async () => {
    expect(await prisma.tenant.findMany()).toEqual([]);
    for (const model of TENANT_MODELS) {
      const rows = await (prisma[model] as unknown as Finder).findMany();
      expect(rows, model).toEqual([]);
    }
  });

  it('o negócio A só lê as próprias linhas, em todas as tabelas', async () => {
    await withTenant(prisma, a.tenantId, async (tx) => {
      const tenants = await tx.tenant.findMany();
      expect(tenants.map((t) => t.id)).toEqual([a.tenantId]);

      for (const model of TENANT_MODELS) {
        const rows = await (tx[model] as unknown as Finder).findMany();
        expect(
          rows.every((row) => row.tenantId === a.tenantId),
          model,
        ).toBe(true);
      }
    });
  });

  it('o negócio A não encontra registros do B nem pelo ID', async () => {
    await withTenant(prisma, a.tenantId, async (tx) => {
      expect(await tx.contact.findUnique({ where: { id: b.contactIds[0]! } })).toBeNull();
      expect(await tx.appointment.findUnique({ where: { id: b.appointmentId } })).toBeNull();
      expect(await tx.tenant.findUnique({ where: { id: b.tenantId } })).toBeNull();
    });
  });

  it('o negócio A não altera nem apaga registros do B', async () => {
    await withTenant(prisma, a.tenantId, async (tx) => {
      const updated = await tx.contact.updateMany({
        where: { id: b.contactIds[0]! },
        data: { name: 'invadido' },
      });
      expect(updated.count).toBe(0);

      const deleted = await tx.event.deleteMany({ where: { tenantId: b.tenantId } });
      expect(deleted.count).toBe(0);
    });

    const still = await withTenant(prisma, b.tenantId, (tx) =>
      tx.contact.findUnique({ where: { id: b.contactIds[0]! } }),
    );
    expect(still?.name).toBe('Cliente Exemplo 1 (demo)');
  });

  it('o negócio A não cria registros em nome do B', async () => {
    await expect(
      withTenant(prisma, a.tenantId, (tx) =>
        tx.contact.create({
          data: { tenantId: b.tenantId, phone: '5500900009999', source: 'PANEL' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('toda ligação entre tabelas de negócio inclui o tenant_id', async () => {
    // Chave estrangeira não passa pelo RLS; sem tenant_id na chave, daria para apontar para outro negócio.
    const loose = await prisma.$queryRaw<{ constraint: string }[]>`
      SELECT con.conname AS constraint
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class dst ON dst.oid = con.confrelid
      JOIN pg_attribute src_tenant ON src_tenant.attrelid = src.oid AND src_tenant.attname = 'tenant_id'
      JOIN pg_attribute dst_tenant ON dst_tenant.attrelid = dst.oid AND dst_tenant.attname = 'tenant_id'
      WHERE con.contype = 'f'
        AND NOT (src_tenant.attnum = ANY (con.conkey) AND dst_tenant.attnum = ANY (con.confkey))`;
    expect(loose.map((c) => c.constraint)).toEqual([]);
  });

  it('o negócio A não grava registros apontando para registros do B', async () => {
    await expect(
      withTenant(prisma, a.tenantId, (tx) =>
        tx.appointment.create({
          data: {
            tenantId: a.tenantId,
            contactId: b.contactIds[0]!,
            serviceId: a.serviceIds[0]!,
            professionalId: a.professionalId,
            startsAt: new Date('2032-01-06T13:00:00Z'),
            endsAt: new Date('2032-01-06T14:00:00Z'),
            source: 'PANEL',
          },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(prisma, a.tenantId, (tx) =>
        tx.consent.create({
          data: {
            tenantId: a.tenantId,
            contactId: b.contactIds[0]!,
            kind: 'OPT_OUT',
            channel: 'whatsapp',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('recusa tenantId que não é UUID', async () => {
    await expect(withTenant(prisma, "x' OR '1'='1", async () => null)).rejects.toThrow(
      'tenantId inválido.',
    );
  });
});

describe('auditoria só de inclusão', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('grava, mas não deixa alterar nem apagar', async () => {
    const tenantId = randomUUID();
    await withTenant(prisma, tenantId, async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: 'Auditoria (demo)', niche: 'cilios' } });
      await tx.auditLog.create({ data: { tenantId, action: 'teste.auditoria' } });
    });

    await expect(
      withTenant(prisma, tenantId, (tx) =>
        tx.auditLog.updateMany({ where: { tenantId }, data: { action: 'adulterado' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(prisma, tenantId, (tx) => tx.auditLog.deleteMany({ where: { tenantId } })),
    ).rejects.toThrow();
  });
});

describe('horário duplo bloqueado pelo banco', () => {
  let prisma: PrismaClient;
  let t: DemoTenant;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function book(startsAt: Date, minutes: number, contactIndex: number) {
    return withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: t.tenantId,
          contactId: t.contactIds[contactIndex]!,
          serviceId: t.serviceIds[0]!,
          professionalId: t.professionalId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + minutes * 60_000),
          source: 'WHATSAPP',
        },
      }),
    );
  }

  it('recusa um segundo horário sobreposto para a mesma profissional', async () => {
    const start = new Date('2030-01-08T13:00:00Z');
    await book(start, 60, 1);
    await expect(book(new Date('2030-01-08T13:30:00Z'), 60, 2)).rejects.toThrow();
  });

  it('aceita horário colado no fim do anterior', async () => {
    await book(new Date('2030-01-09T13:00:00Z'), 60, 1);
    await expect(book(new Date('2030-01-09T14:00:00Z'), 60, 2)).resolves.toBeDefined();
  });

  it('em pedidos simultâneos para o mesmo horário, só um vence', async () => {
    const start = new Date('2030-01-10T13:00:00Z');
    const results = await Promise.allSettled([book(start, 60, 1), book(start, 60, 2)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('horário cancelado libera a vaga', async () => {
    const start = new Date('2030-01-11T13:00:00Z');
    const first = await book(start, 60, 1);
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.appointment.update({ where: { id: first.id }, data: { status: 'CANCELLED' } }),
    );
    await expect(book(start, 60, 2)).resolves.toBeDefined();
  });
});
