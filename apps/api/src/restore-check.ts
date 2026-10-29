import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { backupKey, decryptToFile, pgEnv } from './backup/backup-file.js';

/**
 * Teste de restauração (SEGURANCA.md, A11): restaura um backup num banco VAZIO de conferência
 * e mostra o que voltou. Nunca restaura em cima de um banco com tabelas.
 * Uso: npm run db:restore-check -w @nexo/api -- <arquivo .dump.enc>
 * O banco de conferência vem de BACKUP_RESTORE_URL (crie antes, vazio, com o papel dono).
 */
const KEY_TABLES = ['tenants', 'users', 'contacts', 'appointments', 'messages', 'audit_logs'];

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Informe o arquivo do backup.');
  const target = process.env.BACKUP_RESTORE_URL;
  if (!target) throw new Error('Defina BACKUP_RESTORE_URL com um banco vazio de conferência.');
  if (target === process.env.DATABASE_MIGRATION_URL || target === process.env.DATABASE_URL) {
    throw new Error('BACKUP_RESTORE_URL não pode ser o banco em uso.');
  }
  const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);

  const client = new pg.Client({ connectionString: target });
  await client.connect();
  const work = await mkdtemp(join(tmpdir(), 'nexo-restore-'));
  try {
    const existing = await client.query(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
    );
    if (existing.rows[0].n > 0) {
      throw new Error('O banco de conferência não está vazio. Use um banco novo.');
    }

    const plain = join(work, 'backup.dump');
    await decryptToFile(file, plain, key).catch(() => {
      throw new Error('Não deu para abrir o backup: chave errada ou arquivo alterado.');
    });
    console.log('Backup descriptografado e íntegro (etiqueta conferida).');

    const started = Date.now();
    const code = await new Promise<number>((ok, fail) => {
      const restore = spawn(
        'pg_restore',
        ['--no-owner', '--exit-on-error', '--dbname', pgEnv(target).PGDATABASE!, plain],
        {
          env: { ...process.env, ...pgEnv(target) },
          stdio: ['ignore', 'inherit', 'inherit'],
        },
      );
      restore.once('error', fail);
      restore.once('close', (c) => ok(c ?? 1));
    });
    if (code !== 0) throw new Error(`pg_restore terminou com erro (código ${code}).`);
    console.log(`Restaurado em ${((Date.now() - started) / 1000).toFixed(1)} s.`);

    const rls = await client.query(
      `SELECT count(*) FILTER (WHERE c.relrowsecurity)::int AS with_rls, count(*)::int AS total
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
    );
    console.log(`Tabelas: ${rls.rows[0].total}, com RLS: ${rls.rows[0].with_rls}.`);
    await countRows(target);
    const migrations = await client.query(
      `SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`,
    );
    console.log(`Última migração: ${migrations.rows[0]?.migration_name ?? 'nenhuma'}.`);
  } finally {
    await client.end();
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Conta as linhas com o papel de backup, que enxerga todos os negócios: com o RLS forçado,
 * o dono das tabelas veria zero. Mesmo servidor, banco de conferência.
 */
async function countRows(target: string): Promise<void> {
  const backupUrl = process.env.BACKUP_DATABASE_URL;
  if (!backupUrl) {
    console.log('Sem BACKUP_DATABASE_URL: linhas não contadas (o RLS esconde tudo do dono).');
    return;
  }
  const url = new URL(backupUrl);
  url.pathname = new URL(target).pathname;
  const reader = new pg.Client({ connectionString: url.toString() });
  await reader.connect();
  try {
    for (const table of KEY_TABLES) {
      const { rows } = await reader.query(
        `SELECT count(*)::int AS n FROM ${reader.escapeIdentifier(table)}`,
      );
      console.log(`  ${table}: ${rows[0].n} linhas`);
    }
  } finally {
    await reader.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
