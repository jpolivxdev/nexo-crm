import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Arquivo de backup criptografado (SEGURANCA.md, A11): AES-256-GCM com chave só do cofre.
 * Formato: "NEXOBKP1" (8 bytes) + IV (12) + dados criptografados + etiqueta GCM (16).
 */
const MAGIC = Buffer.from('NEXOBKP1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

/** Lê a chave em base64 e exige 32 bytes. A mensagem de erro nunca mostra o valor. */
export function backupKey(base64: string | undefined): Buffer {
  const key = base64 ? Buffer.from(base64, 'base64') : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY precisa ter 32 bytes em base64 (veja .env.example).');
  }
  return key;
}

/** Criptografa o que vier do `input` (ex.: saída do pg_dump) direto para o arquivo. */
export async function encryptToFile(input: Readable, path: string, key: Buffer): Promise<void> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const out = createWriteStream(path, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));
  await pipeline(input, cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => {
    out.end(cipher.getAuthTag(), () => resolve());
    out.once('error', reject);
  });
}

/**
 * Descriptografa para outro arquivo. Se o backup foi alterado ou a chave está errada,
 * a conferência da etiqueta falha no fim e lança erro: não use o arquivo de saída.
 */
export async function decryptToFile(path: string, outPath: string, key: Buffer): Promise<void> {
  const { size } = await stat(path);
  if (size < HEADER_BYTES + TAG_BYTES) throw new Error('Arquivo de backup incompleto.');
  const handle = await open(path, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, HEADER_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Este arquivo não é um backup da nexo.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(path, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(outPath, { mode: 0o600 }),
  );
}

/**
 * Variáveis para pg_dump e pg_restore a partir de uma URL do Postgres. A senha vai por
 * PGPASSWORD, nunca na linha de comando (lá ela aparece para outros processos da máquina).
 */
export function pgEnv(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    ...(u.searchParams.get('sslmode') ? { PGSSLMODE: u.searchParams.get('sslmode')! } : {}),
  };
}
