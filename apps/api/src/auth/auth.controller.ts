import {
  BadRequestException,
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
import { PrismaService } from '../database/prisma.service.js';
import { AuthService, SESSION_MAX_AGE_SECONDS } from './auth.service.js';
import type { AuthContext, AuthedRequest } from './auth.types.js';
import { clearSessionCookie, sessionCookie } from './cookies.js';
import { MIN_PASSWORD_LENGTH } from './password.js';
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

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().max(256),
});

const INVALID = 'Não foi possível entrar. Confira o e-mail e a senha.';

const PASSWORD_ERRORS = {
  wrong_current: 'A senha atual não confere.',
  too_short: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  same: 'A nova senha precisa ser diferente da atual.',
} as const;

@Controller('auth')
export class AuthController {
  /** 10 tentativas de login por IP a cada 15 minutos. */
  private readonly limiter = new RateLimiter(10, 15 * 60 * 1000);

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Pick<Env, 'NODE_ENV'>,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  /** O que o painel precisa saber de quem está logado. Nunca devolve hash ou segredo. */
  private async publicUser(auth: AuthContext) {
    const tenant = auth.tenantId
      ? await this.db.withTenant(auth.tenantId, (tx) =>
          tx.tenant.findUnique({
            where: { id: auth.tenantId! },
            select: { name: true, onboardingCompletedAt: true },
          }),
        )
      : null;
    return {
      name: auth.name,
      role: auth.role,
      csrfToken: auth.csrfToken,
      mustChangePassword: auth.mustChangePassword,
      businessName: tenant?.name ?? null,
      onboardingPending: tenant ? tenant.onboardingCompletedAt === null : false,
      acting: auth.acting ? { until: auth.acting.until } : null,
    };
  }

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
    return this.publicUser(result.auth);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthedRequest) {
    return this.publicUser(req.auth!);
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async changePassword(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Preencha a senha atual e a nova.');
    const result = await this.auth.changePassword(req.auth!, parsed.data, { ip: req.ip ?? null });
    if (!result.ok) throw new BadRequestException(PASSWORD_ERRORS[result.reason]);
    res.setHeader('Set-Cookie', sessionCookie(result.token, SESSION_MAX_AGE_SECONDS, this.secure));
    return this.publicUser(result.auth);
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
