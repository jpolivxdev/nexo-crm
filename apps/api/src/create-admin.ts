import { randomBytes } from 'node:crypto';
import { encryptField } from './auth/field-crypto.js';
import { hashPassword } from './auth/password.js';
import { generateTotpSecret } from './auth/totp.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './database/prisma.js';

/**
 * Cria (ou recria) um admin nexo, com senha aleatória e segredo do 2FA.
 * Uso: npm run admin:create -w @nexo/api -- email@dominio "Nome"
 * Mostra a senha e o link para o app autenticador uma vez só. Rode num terminal só seu.
 */
async function main(): Promise<void> {
  const [email, name] = process.argv.slice(2);
  if (!email || !name) throw new Error('Uso: npm run admin:create -w @nexo/api -- email "Nome"');
  const env = loadEnv();
  if (!env.FIELD_ENCRYPTION_KEY) {
    throw new Error('Defina FIELD_ENCRYPTION_KEY no .env antes (veja .env.example).');
  }

  const password = randomBytes(12).toString('base64url');
  const secret = generateTotpSecret();
  const data = {
    name,
    role: 'NEXO_ADMIN' as const,
    tenantId: null,
    passwordHash: await hashPassword(password),
    totpSecretEnc: encryptField(secret, env.FIELD_ENCRYPTION_KEY),
    passwordChangedAt: new Date(),
    mustChangePassword: true,
    failedLoginCount: 0,
    lockedUntil: null,
  };
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const normalized = email.trim().toLowerCase();
    await prisma.user.upsert({
      where: { email: normalized },
      create: { email: normalized, ...data },
      update: data,
    });
    const label = encodeURIComponent(`nexo:${normalized}`);
    console.log(`Admin nexo pronto: ${normalized}`);
    console.log(`  senha provisória (troque no primeiro acesso): ${password}`);
    console.log('  2FA: adicione no app autenticador com este link ou segredo');
    console.log(`  otpauth://totp/${label}?secret=${secret}&issuer=nexo`);
    console.log(`  segredo: ${secret}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
