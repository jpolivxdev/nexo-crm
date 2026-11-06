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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { AdminGuard, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { SUPPORT_TOPICS, SupportService } from './support.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });

const openBody = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  subject: z.string().trim().min(3, 'Escreva um resumo (pelo menos 3 letras).').max(120),
  description: z.string().trim().min(10, 'Conte um pouco mais (pelo menos 10 letras).').max(4000),
});
const replyBody = z.object({ body: z.string().trim().min(1).max(4000) });
const statusQuery = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional() });
const statusBody = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']) });

function author(req: AuthedRequest) {
  return { id: req.auth!.userId, name: req.auth!.name };
}

/** Suporte do lado do negócio: só a dona (e o admin numa entrada registrada). */
@Controller('panel/support')
@UseGuards(SessionGuard, TenantGuard)
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}

  private tenant(req: AuthedRequest): string {
    return req.auth!.tenantId!;
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.support.list(this.tenant(req));
  }

  @Get('unread')
  unread(@Req() req: AuthedRequest) {
    return this.support.unread(this.tenant(req));
  }

  @Post()
  open(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.support.open(this.tenant(req), author(req), parse(openBody, body));
  }

  @Get(':id')
  one(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.support.one(this.tenant(req), id);
  }

  @Post(':id/messages')
  reply(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.support.ownerReply(this.tenant(req), id, author(req), parse(replyBody, body).body);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.support.close(this.tenant(req), id);
  }
}

/** Painel de suporte da nexo (admin nexo com 2FA). Vê só os chamados, nunca dado de cliente. */
@Controller('admin/support')
@UseGuards(SessionGuard, AdminGuard)
export class AdminSupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.support.adminList(parse(statusQuery, query).status);
  }

  @Get(':id')
  one(@Param('id', uuid) id: string) {
    return this.support.adminOne(id);
  }

  @Post(':id/messages')
  reply(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.support.adminReply(id, author(req), parse(replyBody, body).body);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@Param('id', uuid) id: string, @Body() body: unknown) {
    return this.support.adminStatus(id, parse(statusBody, body).status);
  }
}
