import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth/password.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './database/prisma.js';
import { createDemoTenant, DEMO_TENANTS } from './seed/demo-tenant.js';

/** Login da dona do negócio de demonstração. E-mail em domínio reservado para teste. */
export const DEMO_OWNER_EMAIL = 'dona@estudio-exemplo.test';

// Cria os negócios de demonstração e o login da dona do primeiro. Só para desenvolvimento.
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed de demonstração não roda em produção.');
  }

  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const created = [];
    for (const input of DEMO_TENANTS) {
      const tenant = await createDemoTenant(prisma, input);
      created.push(tenant);
      console.log(`Criado: ${input.name} (${tenant.tenantId})`);
    }

    // Senha aleatória a cada seed, mostrada só aqui. Dá para fixar com SEED_OWNER_PASSWORD.
    const password = process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString('base64url');
    const passwordHash = await hashPassword(password);
    const tenantId = created[0]!.tenantId;
    await prisma.user.upsert({
      where: { email: DEMO_OWNER_EMAIL },
      create: {
        email: DEMO_OWNER_EMAIL,
        name: 'Ana (demo)',
        passwordHash,
        role: 'OWNER',
        tenantId,
      },
      update: {
        tenantId,
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    console.log('\nPainel: http://localhost:5173');
    console.log(`  e-mail: ${DEMO_OWNER_EMAIL}`);
    console.log(`  senha:  ${password}`);
    console.log(`\nSimulador ligado a esse negócio:\n  SIMULATOR_TENANT_ID=${tenantId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
