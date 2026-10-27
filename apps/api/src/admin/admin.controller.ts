import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { AdminGuard, SessionGuard } from '../auth/session.guard.js';
import { AdminService } from './admin.service.js';

export const NICHES = [
  'cilios',
  'salao',
  'barbearia',
  'estudio',
  'clinica',
  'pet',
  'outro',
] as const;

const createTenantBody = z.object({
  name: z.string().trim().min(2).max(120),
  niche: z.enum(NICHES),
  timezone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso horário inválido.')
    .default('America/Sao_Paulo'),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.email().max(254),
});

const accessBody = z.object({
  reason: z.string().trim().min(10, 'Explique o motivo (pelo menos 10 caracteres).').max(500),
  totp: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos.'),
});

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('tenants')
  tenants() {
    return this.admin.tenants();
  }

  @Post('tenants')
  createTenant(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.admin.createTenant(req.auth!, parse(createTenantBody, body), req.ip ?? null);
  }

  @Post('tenants/:id/access')
  @HttpCode(200)
  async access(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    const result = await this.admin.startAccess(
      req.auth!,
      id,
      parse(accessBody, body),
      req.ip ?? null,
    );
    if (!result.ok) throw new UnauthorizedException('Código do app autenticador inválido.');
    return { until: result.until };
  }

  @Post('access/end')
  @HttpCode(200)
  async endAccess(@Req() req: AuthedRequest) {
    await this.admin.endAccess(req.auth!, req.ip ?? null);
    return { ok: true };
  }
}
