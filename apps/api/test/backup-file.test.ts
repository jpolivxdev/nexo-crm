import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupKey, decryptToFile, encryptToFile, pgEnv } from '../src/backup/backup-file.js';

describe('arquivo de backup criptografado', () => {
  let dir: string;
  const key = randomBytes(32);
  const data = Buffer.concat([Buffer.from('PGDMP conteúdo fictício '), randomBytes(200_000)]);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nexo-backup-test-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('volta igual com a chave certa e não guarda o conteúdo em claro', async () => {
    const enc = join(dir, 'a.enc');
    await encryptToFile(Readable.from([data]), enc, key);
    const raw = await readFile(enc);
    expect(raw.subarray(0, 8).toString()).toBe('NEXOBKP1');
    expect(raw.includes(Buffer.from('PGDMP'))).toBe(false);

    const out = join(dir, 'a.dump');
    await decryptToFile(enc, out, key);
    expect((await readFile(out)).equals(data)).toBe(true);
  });

  it('recusa chave errada e arquivo alterado', async () => {
    const enc = join(dir, 'b.enc');
    await encryptToFile(Readable.from([data]), enc, key);
    await expect(decryptToFile(enc, join(dir, 'b1'), randomBytes(32))).rejects.toThrow();

    const raw = await readFile(enc);
    raw[100] = raw[100]! ^ 0xff;
    await writeFile(join(dir, 'c.enc'), raw);
    await expect(decryptToFile(join(dir, 'c.enc'), join(dir, 'c1'), key)).rejects.toThrow();
  });

  it('exige chave de 32 bytes sem mostrar o valor', () => {
    expect(() => backupKey(undefined)).toThrow(/32 bytes/);
    expect(() => backupKey('curta-demais')).toThrow(/^((?!curta-demais).)*$/);
    expect(backupKey(key.toString('base64')).equals(key)).toBe(true);
  });

  it('passa a senha por variável de ambiente, não na linha de comando', () => {
    expect(pgEnv('postgresql://nexo:s%40nha@db.local:6543/nexo?sslmode=require')).toEqual({
      PGHOST: 'db.local',
      PGPORT: '6543',
      PGUSER: 'nexo',
      PGPASSWORD: 's@nha',
      PGDATABASE: 'nexo',
      PGSSLMODE: 'require',
    });
  });
});
