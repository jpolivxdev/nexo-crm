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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { AllowStaff, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { ChatService, type ChatActor } from './chat.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });
const channelBody = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome do canal precisa de pelo menos 2 letras.')
    .max(40, 'Use até 40 letras no nome do canal.'),
});
const directBody = z.object({ userId: z.uuid('Escolha uma pessoa da equipe.') });
const messageBody = z.object({
  body: z.string().max(2000, 'Use até 2.000 letras por mensagem.'),
});
const messagesQuery = z.object({ before: z.iso.datetime().optional() });

/** Chat interno (Premium). Toda a equipe usa, inclusive a profissional. */
@Controller('panel/chat')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('team_chat')
@AllowStaff()
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  private actor(req: AuthedRequest): ChatActor {
    return { userId: req.auth!.userId, name: req.auth!.name, role: req.auth!.role };
  }

  private tenant(req: AuthedRequest) {
    return req.auth!.tenantId!;
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.chat.list(this.tenant(req), this.actor(req));
  }

  @Post('channels')
  createChannel(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { name } = parse(channelBody, body);
    return this.chat.createChannel(this.tenant(req), name, this.actor(req));
  }

  @Post('channels/:id/archive')
  @HttpCode(200)
  archive(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.chat.archiveChannel(this.tenant(req), id, this.actor(req));
  }

  @Post('direct')
  @HttpCode(200)
  direct(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { userId } = parse(directBody, body);
    return this.chat.direct(this.tenant(req), userId, this.actor(req));
  }

  @Get(':id/messages')
  messages(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Query() query: unknown) {
    const { before } = parse(messagesQuery, query);
    return this.chat.messages(
      this.tenant(req),
      id,
      before ? new Date(before) : undefined,
      this.actor(req),
    );
  }

  @Post(':id/messages')
  send(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.chat.send(this.tenant(req), id, parse(messageBody, body).body, this.actor(req));
  }

  @Delete(':id/messages/:messageId')
  remove(
    @Req() req: AuthedRequest,
    @Param('id', uuid) id: string,
    @Param('messageId', uuid) messageId: string,
  ) {
    return this.chat.remove(this.tenant(req), id, messageId, this.actor(req));
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.chat.read(this.tenant(req), id, this.actor(req));
  }
}
