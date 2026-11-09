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
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { BRAND_FONTS } from '@nexo/core';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { AllowStaff, RequiresAccess, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { BrandService, type BrandActor } from './brand.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });
const lookBody = z.object({
  color: z.string().max(20).nullable().default(null),
  font: z.enum(BRAND_FONTS).nullable().default(null),
});
const domainBody = z.object({ domain: z.string().max(253).nullable() });
const templateBody = z.object({
  channel: z.enum(['whatsapp', 'email']),
  name: z.string().trim().min(2, 'Dê um nome ao modelo.').max(60, 'Use até 60 letras no nome.'),
  subject: z.string().trim().max(150, 'Use até 150 letras no assunto.').nullable().default(null),
  body: z
    .string()
    .trim()
    .min(2, 'Escreva o texto do modelo.')
    .max(4000, 'Use até 4.000 letras no texto.'),
});
const templatesQuery = z.object({ channel: z.enum(['whatsapp', 'email']).optional() });

function sendImage(res: Response, mime: string, data: Uint8Array) {
  res.setHeader('content-type', mime);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-disposition', 'inline');
  res.setHeader('cache-control', 'private, max-age=86400');
  return new StreamableFile(Buffer.from(data));
}

/** Marca do negócio e domínio próprio (Premium). Mudar é da área Configurações. */
@Controller('panel/brand')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('branding')
export class BrandController {
  constructor(@Inject(BrandService) private readonly brand: BrandService) {}

  private actor(req: AuthedRequest): BrandActor {
    return { userId: req.auth!.userId, role: req.auth!.role, ip: req.ip ?? null };
  }

  @RequiresAccess('settings')
  @Get()
  get(@Req() req: AuthedRequest) {
    return this.brand.get(req.auth!.tenantId!);
  }

  @RequiresAccess('settings')
  @Put()
  saveLook(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.brand.saveLook(req.auth!.tenantId!, parse(lookBody, body), this.actor(req));
  }

  /** Logo crua (application/octet-stream), até 1 MB. */
  @RequiresAccess('settings')
  @Post('logo')
  @HttpCode(200)
  saveLogo(@Req() req: AuthedRequest) {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Envie a imagem como application/octet-stream.');
    }
    let name: string;
    try {
      name = decodeURIComponent(String(req.headers['x-file-name'] ?? ''));
    } catch {
      throw new BadRequestException('Nome de arquivo inválido.');
    }
    return this.brand.saveLogo(req.auth!.tenantId!, name, body, this.actor(req));
  }

  /** Toda a equipe vê a logo no painel. */
  @AllowStaff()
  @Get('logo')
  async logo(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const logo = await this.brand.logo(req.auth!.tenantId!);
    return sendImage(res, logo.mime, logo.data);
  }

  @RequiresAccess('settings')
  @Put('domain')
  setDomain(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { domain } = parse(domainBody, body);
    return this.brand.setDomain(req.auth!.tenantId!, domain, this.actor(req));
  }

  @RequiresAccess('settings')
  @Post('domain/verify')
  @HttpCode(200)
  verify(@Req() req: AuthedRequest) {
    return this.brand.verifyDomain(req.auth!.tenantId!, this.actor(req));
  }
}

/** Modelos de mensagem (Premium). Todos usam; criar e mudar é da área Configurações. */
@Controller('panel/templates')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('templates')
export class TemplatesController {
  constructor(@Inject(BrandService) private readonly brand: BrandService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: unknown) {
    return this.brand.templates(req.auth!.tenantId!, parse(templatesQuery, query).channel);
  }

  @RequiresAccess('settings')
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.brand.createTemplate(req.auth!.tenantId!, parse(templateBody, body));
  }

  @RequiresAccess('settings')
  @Put(':id')
  update(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.brand.updateTemplate(req.auth!.tenantId!, id, parse(templateBody, body));
  }

  @RequiresAccess('settings')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.brand.archiveTemplate(req.auth!.tenantId!, id);
  }
}

/**
 * Login no domínio próprio: marca do negócio dono do endereço (só domínio verificado).
 * Sem login; devolve só nome, cor, fonte e se há logo.
 */
@Controller('public/brand')
export class PublicBrandController {
  constructor(@Inject(BrandService) private readonly brand: BrandService) {}

  @Get()
  async get(@Req() req: AuthedRequest) {
    const tenantId = await this.brand.tenantForHost(req.hostname ?? '');
    if (!tenantId) return { brand: null };
    return { brand: await this.brand.brandOf(tenantId) };
  }

  @Get('logo')
  async logo(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const tenantId = await this.brand.tenantForHost(req.hostname ?? '');
    if (!tenantId) throw new BadRequestException('Sem marca para este endereço.');
    const logo = await this.brand.logo(tenantId);
    return sendImage(res, logo.mime, logo.data);
  }
}
