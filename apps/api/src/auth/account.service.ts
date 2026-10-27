import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthTokenKind } from '../generated/prisma/client.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { createTenant } from '../setup/tenant-factory.js';
import { AuditService } from './audit.service.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from './password.js';

/** Link de confirmação de e-mail vale 24 horas; o de nova senha, 30 minutos. */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type PasswordProblem = 'too_short' | 'same_as_email';

export type TokenResult<T extends string = never> =
  { ok: true } | { ok: false; reason: 'invalid' | T };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function passwordProblem(password: string, email: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return 'same_as_email';
  return null;
}

/**
 * Cadastro pelo site, confirmação de e-mail e "esqueci a senha".
 * As respostas nunca dizem se um e-mail tem conta: quem tem recebe o aviso por e-mail.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Pick<Env, 'WEB_ORIGIN'>,
  ) {}

  get mailEnabled(): boolean {
    return this.mailer.enabled;
  }

  /** Cria o negócio e o login da dona, sem confirmação; o link de confirmação vai por e-mail. */
  async signup(
    input: {
      businessName: string;
      niche: string;
      ownerName: string;
      email: string;
      password: string;
    },
    meta: { ip: string | null },
    now = new Date(),
  ): Promise<void> {
    const email = input.email.trim().toLowerCase();
    // O hash vem antes de olhar o banco: o tempo de resposta não revela se o e-mail existe.
    const passwordHash = await hashPassword(input.password);
    const existing = await this.db.client.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerifiedAt) await this.sendAlreadyRegistered(email, existing.name);
      else await this.sendVerification(existing.id, email, existing.name, now);
      return;
    }

    const { tenantId } = await createTenant(
      this.db.client,
      {
        name: input.businessName.trim(),
        niche: input.niche,
        timezone: DEFAULT_TIMEZONE,
        attendantName: input.ownerName.trim(),
      },
      now,
    );
    const user = await this.db.client.user.create({
      data: {
        email,
        name: input.ownerName.trim(),
        role: 'OWNER',
        tenantId,
        passwordHash,
        emailVerifiedAt: null,
        termsAcceptedAt: now,
      },
    });
    await this.audit.record({
      tenantId,
      actorUserId: user.id,
      action: 'account.signup',
      ip: meta.ip,
      metadata: { niche: input.niche },
    });
    await this.sendVerification(user.id, email, user.name, now);
  }

  async verifyEmail(token: string, meta: { ip: string | null }, now = new Date()) {
    const userId = await this.consume(token, 'EMAIL_VERIFY', now);
    if (!userId) return { ok: false, reason: 'invalid' } as const;
    const user = await this.db.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: now },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'account.email_verified',
      ip: meta.ip,
    });
    return { ok: true } as const;
  }

  /** Manda o link de novo só para quem ainda não confirmou. Para os outros, nada acontece. */
  async resendVerification(email: string, now = new Date()): Promise<void> {
    const user = await this.db.client.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user && !user.emailVerifiedAt)
      await this.sendVerification(user.id, user.email, user.name, now);
  }

  async forgotPassword(email: string, meta: { ip: string | null }, now = new Date()) {
    const user = await this.db.client.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) return;
    const token = await this.issue(user.id, 'PASSWORD_RESET', RESET_TTL_MS, now);
    await this.mailer.send({
      to: user.email,
      subject: 'Criar uma nova senha no painel',
      text: [
        `Oi, ${user.name}!`,
        '',
        'Recebemos um pedido para criar uma nova senha no seu painel. Para continuar, abra o link abaixo. Ele vale por 30 minutos e funciona uma vez só:',
        this.link('nova-senha', token),
        '',
        'Se não foi você, pode ignorar este e-mail. Sua senha atual continua valendo.',
      ].join('\n'),
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'password.reset_requested',
      ip: meta.ip,
    });
  }

  /** Troca a senha pelo link: derruba as sessões, destrava a conta e confirma o e-mail. */
  async resetPassword(
    input: { token: string; newPassword: string },
    meta: { ip: string | null },
    now = new Date(),
  ): Promise<TokenResult<PasswordProblem>> {
    const hash = hashToken(input.token);
    const pending = await this.db.client.authToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !pending ||
      pending.kind !== 'PASSWORD_RESET' ||
      pending.usedAt ||
      pending.expiresAt <= now
    ) {
      return { ok: false, reason: 'invalid' };
    }
    // A senha é conferida antes de gastar o link, para a pessoa poder tentar de novo.
    const problem = passwordProblem(input.newPassword, pending.user.email);
    if (problem) return { ok: false, reason: problem };
    const userId = await this.consume(input.token, 'PASSWORD_RESET', now);
    if (!userId) return { ok: false, reason: 'invalid' };

    const user = await this.db.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        passwordChangedAt: now,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: pending.user.emailVerifiedAt ?? now,
      },
    });
    await this.db.client.session.deleteMany({ where: { userId } });
    await this.audit.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'password.reset',
      ip: meta.ip,
    });
    return { ok: true };
  }

  private async sendVerification(userId: string, email: string, name: string, now: Date) {
    const token = await this.issue(userId, 'EMAIL_VERIFY', VERIFY_TTL_MS, now);
    await this.mailer.send({
      to: email,
      subject: 'Confirme seu e-mail para entrar no painel',
      text: [
        `Oi, ${name}!`,
        '',
        'Falta só confirmar seu e-mail. Abra o link abaixo (vale por 24 horas):',
        this.link('confirmar-email', token),
        '',
        'Depois disso, é só entrar no painel com seu e-mail e senha.',
        'Se você não criou uma conta, pode ignorar este e-mail.',
      ].join('\n'),
    });
  }

  private async sendAlreadyRegistered(email: string, name: string) {
    await this.mailer.send({
      to: email,
      subject: 'Você já tem uma conta no painel',
      text: [
        `Oi, ${name}!`,
        '',
        'Alguém tentou criar uma conta com este e-mail, mas ele já tem uma conta.',
        `Para entrar, use: ${this.env.WEB_ORIGIN}/#/entrar`,
        `Esqueceu a senha? Crie uma nova em: ${this.env.WEB_ORIGIN}/#/esqueci-senha`,
        '',
        'Se não foi você, pode ignorar este e-mail.',
      ].join('\n'),
    });
  }

  /** Gera um link novo e invalida os anteriores do mesmo tipo. Guarda só o hash. */
  private async issue(userId: string, kind: AuthTokenKind, ttlMs: number, now: Date) {
    const token = randomBytes(32).toString('base64url');
    await this.db.client.authToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: now },
    });
    await this.db.client.authToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + ttlMs),
        createdAt: now,
      },
    });
    return token;
  }

  /** Gasta o link uma vez só (mesmo com dois cliques ao mesmo tempo). Devolve o usuário. */
  private async consume(token: string, kind: AuthTokenKind, now: Date): Promise<string | null> {
    if (!/^[\w-]{20,100}$/.test(token)) return null;
    const row = await this.db.client.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= now) return null;
    const { count } = await this.db.client.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1 ? row.userId : null;
  }

  private link(route: string, token: string) {
    return `${this.env.WEB_ORIGIN}/#/${route}?token=${token}`;
  }
}
