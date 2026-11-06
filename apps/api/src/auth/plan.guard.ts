import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Feature, hasFeature } from '@nexo/core';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthedRequest } from './auth.types.js';

const REQUIRES_FEATURE = 'nexo:requires-feature';

/** A rota só funciona se o plano do negócio (ou um recurso liberado à parte) incluir isto. */
export const RequiresFeature = (feature: Feature) => SetMetadata(REQUIRES_FEATURE, feature);

export const NOT_IN_PLAN = 'Este recurso não faz parte do plano do seu negócio.';

/**
 * Trava por plano no servidor: esconder o botão na tela não basta. Roda depois do
 * TenantGuard; o negócio vem sempre da sessão. Rota sem @RequiresFeature passa direto.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<Feature | undefined>(REQUIRES_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    const tenantId = context.switchToHttp().getRequest<AuthedRequest>().auth?.tenantId;
    if (!tenantId) throw new ForbiddenException();
    const tenant = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, features: true } }),
    );
    if (!tenant || !hasFeature(tenant.plan, tenant.features, feature)) {
      throw new ForbiddenException(NOT_IN_PLAN);
    }
    return true;
  }
}
