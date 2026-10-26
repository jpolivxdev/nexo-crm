// Libera o login do papel nexo_app no banco LOCAL, com a senha de DATABASE_URL.
// Rode depois de `npm run db:migrate`. Nunca use em produção: lá a senha fica no cofre do provedor.
import pg from 'pg';

if (process.env.NODE_ENV === 'production') {
  console.error('Este script é só para desenvolvimento.');
  process.exit(1);
}

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const appUrl = process.env.DATABASE_URL;
if (!migrationUrl || !appUrl) {
  console.error('Defina DATABASE_MIGRATION_URL e DATABASE_URL no .env (veja .env.example).');
  process.exit(1);
}

const { username, password, hostname } = new URL(appUrl);
if (username !== 'nexo_app') {
  console.error('DATABASE_URL deve usar o usuário nexo_app.');
  process.exit(1);
}
if (!['localhost', '127.0.0.1'].includes(hostname)) {
  console.error('Este script só altera bancos em localhost.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: migrationUrl });
await client.connect();
try {
  const escaped = decodeURIComponent(password).replaceAll("'", "''");
  await client.query(`ALTER ROLE nexo_app LOGIN PASSWORD '${escaped}'`);
  console.log('Papel nexo_app liberado para login local.');
} finally {
  await client.end();
}
