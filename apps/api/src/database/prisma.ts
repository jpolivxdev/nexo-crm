import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export { PrismaClient };

/** Cliente de transação, já preso a um negócio pelo RLS. */
export type TenantTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Executa `fn` numa transação presa ao negócio `tenantId`.
 * O Postgres (RLS) só mostra e só aceita linhas desse negócio, mesmo que a consulta esqueça o filtro.
 * O tenantId deve vir sempre da sessão autenticada, nunca do navegador (SEGURANCA.md, seção 3).
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) {
    throw new Error('tenantId inválido.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
