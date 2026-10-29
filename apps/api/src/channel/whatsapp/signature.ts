import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Confere o cabeçalho X-Hub-Signature-256 da Meta: HMAC-SHA256 do corpo bruto com o App Secret.
 * Usa o corpo exatamente como chegou (antes de qualquer parse) e comparação em tempo constante.
 */
export function isValidSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const [scheme, received] = header.split('=', 2);
  if (scheme !== 'sha256' || !received || !/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(received, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
