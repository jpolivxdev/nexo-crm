import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { NICHES } from '../setup/niches.js';
import { AccountService, passwordProblem } from './account.service.js';
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

const emailSchema = z.object({ email: z.email().max(254) });

const signupSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  niche: z.enum(NICHES),
  ownerName: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  password: z.string().max(256),
  acceptTerms: z.literal(true),
});

const tokenSchema = z.object({ token: z.string().min(1).max(200) });
const resetSchema = tokenSchema.extend({ newPassword: z.string().max(256) });

const INVALID = 'Não foi possível entrar. Confira o e-mail e a senha.';
const LINK_INVALID = 'Esse link venceu ou já foi usado. Peça um novo.';
const MAIL_OFF =
  'O envio de e-mails ainda não está ligado. Fale com a nexo pelo WhatsApp que a gente ajuda.';
const TOO_MANY = 'Muitas tentativas. Espere alguns minutos e tente de novo.';

const NEW_PASSWORD_ERRORS = {
  too_short: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  same_as_email: 'A senha não pode ser igual ao e-mail.',
} as const;

const PASSWORD_ERRORS = {
  wrong_current: 'A senha atual não confere.',
  too_short: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  same: 'A nova senha precisa ser diferente da atual.',
} as const;

@Controller('auth')
export class AuthController {
  /** 10 tentativas de login por IP a cada 15 minutos. */
  private readonly limiter = new RateLimiter(10, 15 * 60 * 1000);
  /** Criar conta: 5 por IP por hora. */
  private readonly signupLimiter = new RateLimiter(5, 60 * 60 * 1000);
  /** E-mails pedidos (esqueci a senha, reenviar): 10 por IP e 3 por e-mail a cada hora. */
  private readonly mailIpLimiter = new RateLimiter(10, 60 * 60 * 1000);
  private readonly mailAddressLimiter = new RateLimiter(3, 60 * 60 * 1000);
  /** Links abertos (confirmar e-mail, nova senha): 20 por IP a cada 15 minutos. */
  private readonly linkLimiter = new RateLimiter(20, 15 * 60 * 1000);

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountService) private readonly account: AccountService,
    @Inject(ENV) private readonly env: Pick<Env, 'NODE_ENV' | 'SIGNUP_ENABLED'>,
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
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
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
      if (result.reason === 'email_not_verified') {
        throw new ForbiddenException({
          message: 'Falta confirmar seu e-mail. Abra o link que enviamos ou peça um novo.',
          emailNotVerified: true,
        });
      }
      throw new UnauthorizedException(INVALID);
    }
    res.setHeader('Set-Cookie', sessionCookie(result.token, SESSION_MAX_AGE_SECONDS, this.secure));
    return this.publicUser(result.auth);
  }

  /** O que a tela de entrada pode oferecer (criar conta, esqueci a senha). */
  @Get('options')
  options() {
    return {
      signupEnabled: this.env.SIGNUP_ENABLED && this.account.mailEnabled,
      passwordResetEnabled: this.account.mailEnabled,
    };
  }

  /** Criar conta. A resposta é a mesma com ou sem conta para o e-mail: o resto vai por e-mail. */
  @Post('signup')
  @HttpCode(202)
  async signup(@Body() body: unknown, @Req() req: AuthedRequest) {
    if (!this.env.SIGNUP_ENABLED) throw new NotFoundException();
    this.requireMail();
    const ip = req.ip ?? null;
    this.limit(this.signupLimiter, ip);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const terms = parsed.error.issues.some((i) => i.path[0] === 'acceptTerms');
      throw new BadRequestException(
        terms ? 'Para criar a conta, aceite os termos de uso.' : 'Confira os campos do cadastro.',
      );
    }
    const problem = passwordProblem(parsed.data.password, parsed.data.email);
    if (problem) throw new BadRequestException(NEW_PASSWORD_ERRORS[problem]);
    await this.account.signup(parsed.data, { ip });
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: unknown, @Req() req: AuthedRequest) {
    this.limit(this.linkLimiter, req.ip ?? null);
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(LINK_INVALID);
    const result = await this.account.verifyEmail(parsed.data.token, { ip: req.ip ?? null });
    if (!result.ok) throw new BadRequestException(LINK_INVALID);
    return { ok: true };
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  async resendVerification(@Body() body: unknown, @Req() req: AuthedRequest) {
    const email = this.mailRequest(body, req);
    await this.account.resendVerification(email);
    return { ok: true };
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown, @Req() req: AuthedRequest) {
    const email = this.mailRequest(body, req);
    await this.account.forgotPassword(email, { ip: req.ip ?? null });
    return { ok: true };
  }

  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() req: AuthedRequest) {
    this.limit(this.linkLimiter, req.ip ?? null);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(LINK_INVALID);
    const result = await this.account.resetPassword(parsed.data, { ip: req.ip ?? null });
    if (!result.ok) {
      throw new BadRequestException(
        result.reason === 'invalid' ? LINK_INVALID : NEW_PASSWORD_ERRORS[result.reason],
      );
    }
    return { ok: true };
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

  /** Pedidos que mandam e-mail: limite por IP e por endereço, e-mail válido. */
  private mailRequest(body: unknown, req: AuthedRequest): string {
    this.requireMail();
    this.limit(this.mailIpLimiter, req.ip ?? null);
    const parsed = emailSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Digite um e-mail válido.');
    const email = parsed.data.email.trim().toLowerCase();
    this.limit(this.mailAddressLimiter, email);
    return email;
  }

  private requireMail(): void {
    if (!this.account.mailEnabled) throw new ServiceUnavailableException(MAIL_OFF);
  }

  private limit(limiter: RateLimiter, key: string | null): void {
    if (!limiter.take(key ?? 'desconhecido')) {
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Cookie Secure em produção (HTTPS). No localhost o painel roda em http. */
  private get secure(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
