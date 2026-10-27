import { randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../auth/audit.service.js';
import { ACTING_MS, AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hashPassword } from '../auth/password.js';
import { PrismaService } from '../database/prisma.service.js';
import { createTenant } from '../setup/tenant-factory.js';

/** Área do admin nexo: criar negócio, medir onboarding e entrar num negócio com motivo. */
@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lista do diretório (nome, nicho e datas). Não lê nenhum dado de cliente final. */
  async tenants() {
    const rows = await this.db.client.tenantDirectory.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((t) => ({
      ...t,
      onboardingMinutes:
        t.onboardingStartedAt && t.onboardingCompletedAt
          ? Math.round(
              (t.onboardingCompletedAt.getTime() - t.onboardingStartedAt.getTime()) / 60_000,
            )
          : null,
    }));
  }

  /** Cria o negócio e o login da dona com senha provisória (mostrada uma vez só). */
  async createTenant(
    admin: AuthContext,
    input: { name: string; niche: string; timezone: string; ownerName: string; ownerEmail: string },
    ip: string | null,
  ) {
    const email = input.ownerEmail.trim().toLowerCase();
    if (await this.db.client.user.findUnique({ where: { email } })) {
      throw new ConflictException('Já existe um login com esse e-mail.');
    }
    const { tenantId } = await createTenant(this.db.client, {
      name: input.name,
      niche: input.niche,
      timezone: input.timezone,
      attendantName: input.ownerName,
    });
    const temporaryPassword = randomBytes(9).toString('base64url');
    await this.db.client.user.create({
      data: {
        email,
        name: input.ownerName,
        role: 'OWNER',
        tenantId,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await this.audit.record({
      tenantId,
      actorUserId: admin.userId,
      action: 'admin.tenant_created',
      ip,
      metadata: { niche: input.niche },
    });
    return { tenantId, ownerEmail: email, temporaryPassword };
  }

  /**
   * Entrada controlada: motivo obrigatório, 2FA de novo, prazo de 1 hora e registro na
   * auditoria do próprio negócio (a dona pode ver quem entrou e por quê).
   */
  async startAccess(
    admin: AuthContext,
    tenantId: string,
    input: { reason: string; totp: string },
    ip: string | null,
    now = new Date(),
  ): Promise<{ ok: true; until: Date } | { ok: false }> {
    if (!(await this.auth.verifySecondFactor(admin.userId, input.totp, now))) return { ok: false };
    const exists = await this.db.client.tenantDirectory.findUnique({ where: { id: tenantId } });
    if (!exists) throw new NotFoundException('Negócio não encontrado.');
    const until = new Date(now.getTime() + ACTING_MS);
    await this.auth.setActing(admin.sessionId, { tenantId, reason: input.reason, until });
    await this.audit.record({
      tenantId,
      actorUserId: admin.userId,
      action: 'admin.access_started',
      reason: input.reason,
      ip,
      metadata: { until: until.toISOString() },
    });
    return { ok: true, until };
  }

  async endAccess(admin: AuthContext, ip: string | null): Promise<void> {
    if (!admin.acting) return;
    await this.auth.setActing(admin.sessionId, null);
    await this.audit.record({
      tenantId: admin.acting.tenantId,
      actorUserId: admin.userId,
      action: 'admin.access_ended',
      ip,
    });
  }
}
