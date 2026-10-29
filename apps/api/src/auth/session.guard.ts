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

/**
 * Painel do negócio: dona e equipe, sempre presas ao próprio negócio; admin nexo só durante
 * uma entrada controlada (motivo + 2FA + prazo). Senha provisória precisa ser trocada antes.
 * A equipe só entra nas rotas marcadas com @AllowStaff().
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (auth?.mustChangePassword)
      throw new ForbiddenException('Troque a senha provisória primeiro.');
    const staffAllowed = this.reflector.getAllAndOverride<boolean>(ALLOW_STAFF, [
      context.getHandler(),
      context.getClass(),
    ]);
    const member = auth?.role === 'OWNER' || (auth?.role === 'STAFF' && staffAllowed === true);
    const admin = auth?.role === 'NEXO_ADMIN' && auth.acting !== null;
    if (!auth?.tenantId || !(member || admin)) throw new ForbiddenException();
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
