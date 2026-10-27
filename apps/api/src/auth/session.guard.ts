import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

/** Painel do negócio: só dono e equipe, sempre presos ao próprio negócio. */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth?.tenantId || (auth.role !== 'OWNER' && auth.role !== 'STAFF')) {
      throw new ForbiddenException();
    }
    return true;
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
