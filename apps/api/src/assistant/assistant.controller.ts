import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { AssistantService } from './assistant.service.js';

const askBody = z.object({
  question: z.string().trim().min(3, 'Escreva sua dúvida.').max(500, 'Pergunta longa demais.'),
  history: z
    .array(z.object({ role: z.enum(['user', 'model']), text: z.string().trim().min(1).max(1500) }))
    .max(6)
    .default([]),
});

/** Nex, guia de uso: pergunta livre sobre como usar o painel. */
@Controller('panel/assistant')
@UseGuards(SessionGuard, TenantGuard)
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Get()
  status(@Req() req: AuthedRequest) {
    return this.assistant.status(req.auth!.tenantId!);
  }

  @Post()
  @HttpCode(200)
  ask(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = askBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }
    return this.assistant.ask(req.auth!.tenantId!, parsed.data.question, parsed.data.history);
  }
}
