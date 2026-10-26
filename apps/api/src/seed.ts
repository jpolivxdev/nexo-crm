import { loadEnv } from './config/env.js';
import { createPrismaClient } from './database/prisma.js';
import { createDemoTenant, DEMO_TENANTS } from './seed/demo-tenant.js';

// Cria os negócios de demonstração. Só para desenvolvimento e teste.
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed de demonstração não roda em produção.');
  }

  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    for (const input of DEMO_TENANTS) {
      const tenant = await createDemoTenant(prisma, input);
      console.log(`Criado: ${input.name} (${tenant.tenantId})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
