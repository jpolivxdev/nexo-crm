import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Código de 6 dígitos que muda a cada 30 s (RFC 6238, o mesmo dos apps autenticadores). */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, at: Date, offsetSteps = 0): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(value).padStart(DIGITS, '0');
}

/** Aceita o código atual e o vizinho de cada lado (relógio do celular um pouco fora). */
export function verifyTotp(secret: string, code: string, at = new Date()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((offset) =>
    timingSafeEqual(Buffer.from(totpCode(secret, at, offset)), Buffer.from(code)),
  );
}

function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Segredo do 2FA inválido.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
