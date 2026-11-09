import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { RequiresAccess, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { ContactsPlusService } from './contacts-plus.service.js';
import type { CrmActor } from './crm.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const csvBody = z.object({
  csv: z.string().min(1, 'A planilha está vazia.').max(200_000, 'Planilha grande demais.'),
  updateExisting: z.boolean().default(false),
});

const days = z.number().int().min(1).max(730);
const rulesBody = z.object({ attentionDays: days, riskDays: days, lostDays: days });

/**
 * Premium: importar e exportar clientes (área Dados pessoais) e a Carteira. As regras da
 * Carteira são da área Configurações.
 */
@Controller('panel/crm')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('contacts_plus')
export class ContactsPlusController {
  constructor(@Inject(ContactsPlusService) private readonly contacts: ContactsPlusService) {}

  private actor(req: AuthedRequest): CrmActor {
    return { userId: req.auth!.userId, role: req.auth!.role, ip: req.ip ?? null };
  }

  @RequiresAccess('privacy')
  @Post('contacts/import/check')
  @HttpCode(200)
  check(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.contacts.checkImport(req.auth!.tenantId!, parse(csvBody, body).csv);
  }

  @RequiresAccess('privacy')
  @Post('contacts/import')
  @HttpCode(200)
  import(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { csv, updateExisting } = parse(csvBody, body);
    return this.contacts.import(req.auth!.tenantId!, csv, updateExisting, this.actor(req));
  }

  @RequiresAccess('privacy')
  @Get('contacts/export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="clientes.csv"')
  @Header('cache-control', 'no-store')
  exportCsv(@Req() req: AuthedRequest) {
    return this.contacts.exportCsv(req.auth!.tenantId!, this.actor(req));
  }

  @Get('portfolio')
  portfolio(@Req() req: AuthedRequest) {
    return this.contacts.portfolio(req.auth!.tenantId!);
  }

  @RequiresAccess('settings')
  @Put('portfolio/rules')
  saveRules(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.contacts.saveRules(req.auth!.tenantId!, parse(rulesBody, body), this.actor(req));
  }
}
