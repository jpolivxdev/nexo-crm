import { hash, verify } from '@node-rs/argon2';

/** Argon2id com os parâmetros mínimos da OWASP (19 MiB, 2 passadas, 1 thread). */
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return hash(password, OPTIONS);
}

// Hash de uma senha qualquer: usado quando o e-mail não existe, para o tempo de resposta
// não revelar quais e-mails têm conta.
let dummy: Promise<string> | null = null;

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    dummy ??= hash('senha-que-ninguem-usa-0000', OPTIONS);
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}
