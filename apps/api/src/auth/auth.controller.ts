import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { AuthService, SESSION_MAX_AGE_SECONDS } from './auth.service.js';
import type { AuthContext, AuthedRequest } from './auth.types.js';
import { clearSessionCookie, sessionCookie } from './cookies.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionGuard } from './session.guard.js';

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

const INVALID = 'Não foi possível entrar. Confira o e-mail e a senha.';

export function publicUser(auth: AuthContext) {
  return { name: auth.name, role: auth.role, csrfToken: auth.csrfToken };
}

@Controller('auth')
export class AuthController {
  /** 10 tentativas de login por IP a cada 15 minutos. */
  private readonly limiter = new RateLimiter(10, 15 * 60 * 1000);

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Pick<Env, 'NODE_ENV'>,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? null;
    if (!this.limiter.take(ip ?? 'desconhecido')) {
      throw new HttpException(
        'Muitas tentativas. Espere alguns minutos e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException(INVALID);

    const result = await this.auth.login(parsed.data, { ip });
    if (!result.ok) {
      if (result.reason === 'totp_required') {
        throw new UnauthorizedException({
          message: 'Digite o código do app autenticador.',
          totpRequired: true,
        });
      }
      throw new UnauthorizedException(INVALID);
    }
    res.setHeader('Set-Cookie', sessionCookie(result.token, SESSION_MAX_AGE_SECONDS, this.secure));
    return publicUser(result.auth);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthedRequest) {
    return publicUser(req.auth!);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth!, { ip: req.ip ?? null });
    res.setHeader('Set-Cookie', clearSessionCookie(this.secure));
    return { ok: true };
  }

  /** Cookie Secure em produção (HTTPS). No localhost o painel roda em http. */
  private get secure(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
