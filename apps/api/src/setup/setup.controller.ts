import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { businessBody, faqBody, hoursBody, servicesBody } from './setup.schemas.js';
import { SetupService } from './setup.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

/** Assistente de configuração (dona, ou admin nexo numa entrada controlada). */
@Controller('panel/setup')
@UseGuards(SessionGuard, TenantGuard)
export class SetupController {
  constructor(@Inject(SetupService) private readonly setup: SetupService) {}

  private tenant(req: AuthedRequest): string {
    return req.auth!.tenantId!;
  }

  @Get()
  get(@Req() req: AuthedRequest) {
    return this.setup.get(this.tenant(req));
  }

  @Put('business')
  business(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.setup.saveBusiness(this.tenant(req), parse(businessBody, body));
  }

  @Put('services')
  services(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.setup.saveServices(this.tenant(req), parse(servicesBody, body));
  }

  @Put('hours')
  hours(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.setup.saveHours(this.tenant(req), parse(hoursBody, body));
  }

  @Put('faq')
  faq(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.setup.saveFaq(this.tenant(req), parse(faqBody, body));
  }

  @Post('complete')
  @HttpCode(200)
  complete(@Req() req: AuthedRequest) {
    return this.setup.complete(this.tenant(req));
  }
}
