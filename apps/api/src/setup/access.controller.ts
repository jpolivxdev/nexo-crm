import { ACCESS_AREAS, accessRulesOf, hasFeature, TEAM_ROLES } from '@nexo/core';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../auth/audit.service.js';
import type { AuthedRequest } from '../auth/auth.types.js';
import { OwnerOnly, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { PrismaService } from '../database/prisma.service.js';

const areaRow = z.object(Object.fromEntries(ACCESS_AREAS.map((a) => [a, z.boolean()])));
const accessBody = z.object({
  rules: z.object(Object.fromEntries(TEAM_ROLES.map((r) => [r, areaRow]))),
  requireMfa: z.boolean(),
});

const PREMIUM_ONLY = 'Acessos por papel fazem parte do plano Premium.';

/**
 * Configurações → Acessos (Premium, só o dono): o que gestor, consultor e profissional veem,
 * e se dono e gestores precisam da verificação em duas etapas. O servidor aplica no TenantGuard.
 */
@Controller('panel/access')
@OwnerOnly()
@UseGuards(SessionGuard, TenantGuard)
export class AccessController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  get(@Req() req: AuthedRequest) {
    return this.read(req.auth!.tenantId!);
  }

  @Put()
  async put(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = accessBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dados inválidos.');
    const tenantId = req.auth!.tenantId!;
    const current = await this.read(tenantId);
    if (!current.available) throw new ForbiddenException(PREMIUM_ONLY);
    // Exigir 2FA de todo mundo sem ter o próprio ligado trancaria o dono para fora.
    if (parsed.data.requireMfa && !req.auth!.twoFactor && !req.auth!.acting) {
      throw new BadRequestException(
        'Ligue a sua verificação em duas etapas antes de exigir da equipe.',
      );
    }
    const rules = accessRulesOf(parsed.data.rules);
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { accessRules: rules, requireMfa: parsed.data.requireMfa },
      }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: req.auth!.userId,
      action: 'access.updated',
      ip: req.ip ?? null,
      metadata: { rules, requireMfa: parsed.data.requireMfa },
    });
    return this.read(tenantId);
  }

  private async read(tenantId: string) {
    const tenant = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true, features: true, accessRules: true, requireMfa: true },
      }),
    );
    return {
      available: hasFeature(tenant.plan, tenant.features, 'team_roles'),
      rules: accessRulesOf(tenant.accessRules),
      requireMfa: tenant.requireMfa,
    };
  }
}
