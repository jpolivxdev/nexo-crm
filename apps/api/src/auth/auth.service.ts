import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from './audit.service.js';
import type { AuthContext } from './auth.types.js';
import { decryptField } from './field-crypto.js';
import { verifyPassword } from './password.js';
import { verifyTotp } from './totp.js';

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** Sem uso por 12 horas, a sessão cai. */
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export type LoginResult =
  | { ok: true; token: string; auth: AuthContext }
  | { ok: false; reason: 'invalid' | 'totp_required' };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Pick<Env, 'FIELD_ENCRYPTION_KEY'>,
  ) {}

  /**
   * Entra com e-mail e senha (e código do 2FA para admin nexo).
   * Erro sempre genérico; 5 erros seguidos bloqueiam a conta por 15 minutos.
   */
  async login(
    input: { email: string; password: string; totp?: string },
    meta: { ip: string | null },
    now = new Date(),
  ): Promise<LoginResult> {
    const users = this.db.client.user;
    const user = await users.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    const passwordOk = await verifyPassword(user?.passwordHash ?? null, input.password);

    if (!user) return { ok: false, reason: 'invalid' };
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.audit.record({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'login.blocked',
        ip: meta.ip,
      });
      return { ok: false, reason: 'invalid' };
    }

    let ok = passwordOk;
    if (ok && user.role === 'NEXO_ADMIN') {
      // 2FA obrigatório para admin nexo. Sem segredo cadastrado, não entra.
      if (!input.totp) return { ok: false, reason: 'totp_required' };
      ok = this.checkTotp(user.totpSecretEnc, input.totp, now);
    }

    if (!ok) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= MAX_FAILURES;
      await users.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }
          : { failedLoginCount: failures },
      });
      await this.audit.record({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: lock ? 'login.locked' : 'login.failed',
        ip: meta.ip,
      });
      return { ok: false, reason: 'invalid' };
    }

    await users.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const session = await this.db.client.session.create({
      data: {
        id: hashToken(token),
        userId: user.id,
        csrfToken,
        expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
        lastSeenAt: now,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'login.succeeded',
      ip: meta.ip,
    });
    return {
      ok: true,
      token,
      auth: {
        sessionId: session.id,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        name: user.name,
        csrfToken,
      },
    };
  }

  /** Confere o cookie. Sessão vencida, parada há muito tempo ou anterior à troca de senha cai. */
  async authenticate(token: string, now = new Date()): Promise<AuthContext | null> {
    if (!/^[\w-]{20,100}$/.test(token)) return null;
    const session = await this.db.client.session.findUnique({
      where: { id: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    const idle = now.getTime() - session.lastSeenAt.getTime() > IDLE_LIMIT_MS;
    const stale = session.createdAt < session.user.passwordChangedAt;
    if (session.expiresAt <= now || idle || stale) {
      await this.db.client.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    // Atualiza o "visto por último" no máximo uma vez por minuto.
    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      await this.db.client.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return {
      sessionId: session.id,
      userId: session.userId,
      tenantId: session.user.tenantId,
      role: session.user.role,
      name: session.user.name,
      csrfToken: session.csrfToken,
    };
  }

  async logout(auth: AuthContext, meta: { ip: string | null }): Promise<void> {
    await this.db.client.session.deleteMany({ where: { id: auth.sessionId } });
    await this.audit.record({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'logout',
      ip: meta.ip,
    });
  }

  private checkTotp(secretEnc: string | null, code: string, now: Date): boolean {
    const key = this.env.FIELD_ENCRYPTION_KEY;
    if (!secretEnc || !key) return false;
    try {
      return verifyTotp(decryptField(secretEnc, key), code, now);
    } catch {
      return false;
    }
  }
}
