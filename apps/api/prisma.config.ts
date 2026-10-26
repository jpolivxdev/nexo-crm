import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho. Em CI e produção as variáveis já vêm do ambiente.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Sem .env: segue com o ambiente atual.
}

// Migrações usam o papel dono das tabelas (DATABASE_MIGRATION_URL).
// A aplicação usa o papel nexo_app, sem superusuário e sem BYPASSRLS (DATABASE_URL).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --env-file-if-exists=../../.env dist/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_MIGRATION_URL ?? '',
  },
});
