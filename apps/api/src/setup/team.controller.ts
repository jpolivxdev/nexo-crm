import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { newProfessionalBody, professionalBody, staffLoginBody } from './setup.schemas.js';
import { TeamService } from './team.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

/** Equipe (só a dona). O negócio vem sempre da sessão. */
@Controller('panel/team')
@UseGuards(SessionGuard, TenantGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  private actor(req: AuthedRequest) {
    return { userId: req.auth!.userId, ip: req.ip ?? null };
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.team.list(req.auth!.tenantId!);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.team.create(req.auth!.tenantId!, parse(newProfessionalBody, body));
  }

  @Put(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.team.update(req.auth!.tenantId!, id, parse(professionalBody, body));
  }

  @Post(':id/login')
  createLogin(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    const { email } = parse(staffLoginBody, body);
    return this.team.createLogin(req.auth!.tenantId!, id, email, this.actor(req));
  }

  @Delete(':id/login')
  @HttpCode(200)
  removeLogin(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.team.removeLogin(req.auth!.tenantId!, id, this.actor(req));
  }
}
