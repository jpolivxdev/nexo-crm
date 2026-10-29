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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { timeOffBody } from './setup.schemas.js';
import { TimeOffService } from './time-off.service.js';

/** Folgas e bloqueios. O negócio vem sempre da sessão. */
@Controller('panel/time-off')
@UseGuards(SessionGuard, TenantGuard)
export class TimeOffController {
  constructor(@Inject(TimeOffService) private readonly timeOff: TimeOffService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.timeOff.list(req.auth!.tenantId!);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = timeOffBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }
    return this.timeOff.create(req.auth!.tenantId!, parsed.data);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.timeOff.remove(req.auth!.tenantId!, id);
    return { ok: true };
  }
}
