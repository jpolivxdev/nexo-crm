import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { backupKey, encryptToFile, pgEnv } from './backup/backup-file.js';

/**
 * Backup completo do banco (tabelas, RLS, fila), criptografado (SEGURANCA.md, A11).
 * Usa o papel nexo_backup (BACKUP_DATABASE_URL): só lê, mas enxerga todos os negócios, porque
 * o RLS forçado barra até o dono das tabelas. Crie com scripts/setup-backup-role.sql.
 * Uso: npm run db:backup -w @nexo/api   (precisa do pg_dump instalado)
 */
async function main(): Promise<void> {
  const url = process.env.BACKUP_DATABASE_URL;
  if (!url) throw new Error('Defina BACKUP_DATABASE_URL (veja .env.example).');
  const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const dir = resolve(process.env.BACKUP_DIR || 'backups');
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `nexo-${stamp}.dump.enc`);
  const dump = spawn('pg_dump', ['--format=custom', '--no-password'], {
    env: { ...process.env, ...pgEnv(url) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise<number>((ok, fail) => {
    dump.once('error', fail);
    dump.once('close', (code) => ok(code ?? 1));
  });
  await encryptToFile(dump.stdout, file, key);
  const code = await exited;
  if (code !== 0) throw new Error(`pg_dump terminou com erro (código ${code}).`);
  console.log(`Backup criptografado salvo em ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
