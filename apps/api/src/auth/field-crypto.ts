import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografia de campo (AES-256-GCM) para segredos guardados no banco, como o do 2FA.
 * A chave fica fora do banco (FIELD_ENCRYPTION_KEY, 32 bytes em base64).
 * Formato: v1.<iv>.<tag>.<cifrado>, tudo em base64url.
 */
export function encryptField(plain: string, keyBase64: string): string {
  const key = readKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptField(encoded: string, keyBase64: string): string {
  const [version, iv, tag, data] = encoded.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Campo criptografado inválido.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    readKey(keyBase64),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function readKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY precisa ter 32 bytes em base64.');
  return key;
}
