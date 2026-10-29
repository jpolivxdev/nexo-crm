import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { alertsBody } from './setup.schemas.js';

/** Conta → Avisos (só a dona). O negócio vem sempre da sessão. */
@Controller('panel/setup/alerts')
@UseGuards(SessionGuard, TenantGuard)
export class AlertsController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  @Get()
  get(@Req() req: AuthedRequest) {
    return this.read(req.auth!.tenantId!);
  }

  @Put()
  async put(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = alertsBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }
    const tenantId = req.auth!.tenantId!;
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: parsed.data }),
    );
    return this.read(tenantId);
  }

  private async read(tenantId: string) {
    const tenant = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { notifyEmail: true, nextVisitDays: true },
      }),
    );
    // Sem provedor de e-mail (produção hoje), a tela avisa que o e-mail ainda não sai.
    return { ...tenant, emailAvailable: this.mailer.enabled };
  }
}
