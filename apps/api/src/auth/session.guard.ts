import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AccessArea, accessRulesOf, areasFor, hasFeature } from '@nexo/core';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './auth.types.js';
import { readCookie, SESSION_COOKIE } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Exige sessão válida. Em rotas que mudam dados, exige também o token CSRF no cabeçalho
 * (x-csrf-token), igual ao guardado na sessão.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const auth = token ? await this.auth.authenticate(token) : null;
    if (!auth) throw new UnauthorizedException();

    if (!SAFE_METHODS.has(req.method)) {
      const given = req.headers['x-csrf-token'];
      if (typeof given !== 'string' || !sameToken(given, auth.csrfToken)) {
        throw new ForbiddenException('Token CSRF inválido.');
      }
    }
    req.auth = auth;
    return true;
  }
}

const ALLOW_STAFF = 'nexo:allow-staff';
/**
 * Libera a rota para a profissional da equipe (STAFF). Sem isto, só a dona (e o admin nexo
 * numa entrada controlada) passa: a equipe vê só a própria agenda (CLAUDE.md, seção 8.1).
 */
export const AllowStaff = () => SetMetadata(ALLOW_STAFF, true);

const OWNER_ONLY = 'nexo:owner-only';
/** Só o dono (e o admin nexo numa entrada controlada): equipe, acessos e plano. */
export const OwnerOnly = () => SetMetadata(OWNER_ONLY, true);

const ACCESS_AREA = 'nexo:access-area';
/**
 * Área que o dono libera por papel em Acessos (Premium). Gestor e consultor só passam se o
 * papel tiver a área ligada. Rota sem área é dia a dia: gestor e consultor passam.
 */
export const RequiresAccess = (area: AccessArea) => SetMetadata(ACCESS_AREA, area);

export const MFA_REQUIRED = 'Ligue a verificação em duas etapas para continuar.';
const ROLE_NOT_IN_PLAN = 'O acesso de gestor e consultor faz parte do plano Premium.';
const NO_ACCESS = 'Seu papel na equipe não tem acesso a esta parte.';

/**
 * Painel do negócio: dona e equipe, sempre presas ao próprio negócio; admin nexo só durante
 * uma entrada controlada (motivo + 2FA + prazo). Senha provisória precisa ser trocada antes.
 * A profissional (STAFF) só entra nas rotas marcadas com @AllowStaff(). Gestor e consultor
 * (Premium) seguem os Acessos por papel. Se o negócio exige 2FA, dono e gestor sem 2FA param.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly db: Pick<PrismaService, 'withTenant'>,
  ) {}

  private meta<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (auth?.mustChangePassword)
      throw new ForbiddenException('Troque a senha provisória primeiro.');
    if (!auth?.tenantId) throw new ForbiddenException();
    if (auth.role === 'NEXO_ADMIN') {
      if (auth.acting === null) throw new ForbiddenException();
      return true;
    }
    const role = auth.role;
    if (role === 'STAFF') {
      if (this.meta<boolean>(ALLOW_STAFF, context) !== true) throw new ForbiddenException();
      return true;
    }
    if (role !== 'OWNER' && role !== 'MANAGER' && role !== 'CONSULTANT') {
      throw new ForbiddenException();
    }
    if (role !== 'OWNER' && this.meta<boolean>(OWNER_ONLY, context) === true) {
      throw new ForbiddenException(NO_ACCESS);
    }
    const area = this.meta<AccessArea>(ACCESS_AREA, context);
    // Dono com 2FA ligado não precisa consultar nada.
    if (role === 'OWNER' && auth.twoFactor) return true;

    const tenantId = auth.tenantId;
    const tenant = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, features: true, accessRules: true, requireMfa: true },
      }),
    );
    if (!tenant) throw new ForbiddenException();
    if (tenant.requireMfa && role !== 'CONSULTANT' && !auth.twoFactor) {
      throw new ForbiddenException({ message: MFA_REQUIRED, mfaRequired: true });
    }
    if (role === 'OWNER') return true;
    if (!hasFeature(tenant.plan, tenant.features, 'team_roles')) {
      throw new ForbiddenException(ROLE_NOT_IN_PLAN);
    }
    if (area && !areasFor(role, accessRulesOf(tenant.accessRules)).includes(area)) {
      throw new ForbiddenException(NO_ACCESS);
    }
    return true;
  }
}

/** Área do admin nexo. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (auth?.role !== 'NEXO_ADMIN') throw new ForbiddenException();
    if (auth.mustChangePassword)
      throw new ForbiddenException('Troque a senha provisória primeiro.');
    return true;
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
