import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { ConversationService } from '../conversation/conversation.service.js';
import { RealtimeBus, type RealtimeNotice } from '../realtime/realtime.bus.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import { SchedulingErrorFilter } from './scheduling-error.filter.js';
import {
  agendaQuery,
  bookBody,
  contactsQuery,
  createContactBody,
  moveDealBody,
  replyBody,
  rescheduleBody,
  slotsQuery,
  statusBody,
  updateContactBody,
} from './panel.schemas.js';
import { PanelService } from './panel.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });

/** Painel do negócio. O negócio vem sempre da sessão (req.auth.tenantId). */
@Controller('panel')
@UseGuards(SessionGuard, TenantGuard)
@UseFilters(SchedulingErrorFilter)
export class PanelController {
  constructor(
    @Inject(PanelService) private readonly panel: PanelService,
    @Inject(SchedulingService) private readonly scheduling: SchedulingService,
    @Inject(ConversationService) private readonly conversations: ConversationService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private tenant(req: AuthedRequest): string {
    return req.auth!.tenantId!;
  }

  private actor(req: AuthedRequest) {
    return { type: 'user' as const, id: req.auth!.userId };
  }

  @Get('today')
  today(@Req() req: AuthedRequest) {
    return this.panel.today(this.tenant(req));
  }

  @Get('agenda')
  agenda(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { from, days } = parse(agendaQuery, query);
    return this.panel.agenda(this.tenant(req), from, days);
  }

  @Get('services')
  services(@Req() req: AuthedRequest) {
    return this.panel.services(this.tenant(req));
  }

  @Get('slots')
  async slots(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { serviceId, date } = parse(slotsQuery, query);
    const slots = await this.scheduling.listSlots(this.tenant(req), { serviceId, date });
    return slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
  }

  @Post('appointments')
  book(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(bookBody, body);
    return this.scheduling.book(this.tenant(req), {
      contactId: input.contactId,
      serviceId: input.serviceId,
      startsAt: new Date(input.startsAt),
      source: 'PANEL',
      actor: this.actor(req),
    });
  }

  @Post('appointments/:id/status')
  @HttpCode(200)
  setStatus(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    const { status } = parse(statusBody, body);
    return this.scheduling.setStatus(this.tenant(req), id, status, this.actor(req));
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  reschedule(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    const { startsAt } = parse(rescheduleBody, body);
    return this.scheduling.reschedule(this.tenant(req), id, {
      startsAt: new Date(startsAt),
      actor: this.actor(req),
    });
  }

  @Get('contacts')
  contacts(@Req() req: AuthedRequest, @Query() query: unknown) {
    return this.panel.contacts(this.tenant(req), parse(contactsQuery, query).q || undefined);
  }

  @Post('contacts')
  createContact(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.panel.createContact(
      this.tenant(req),
      parse(createContactBody, body),
      this.actor(req),
    );
  }

  @Get('contacts/:id')
  contact(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.panel.contact(this.tenant(req), id);
  }

  @Patch('contacts/:id')
  updateContact(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.panel.updateContact(this.tenant(req), id, parse(updateContactBody, body));
  }

  @Get('pipeline')
  pipeline(@Req() req: AuthedRequest) {
    return this.panel.pipeline(this.tenant(req));
  }

  @Post('deals/:id/stage')
  @HttpCode(200)
  moveDeal(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    const { stageId } = parse(moveDealBody, body);
    return this.panel.moveDeal(this.tenant(req), id, stageId, this.actor(req));
  }

  @Post('conversations/:id/resume')
  @HttpCode(200)
  async resume(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    await this.conversations.resumeBot(this.tenant(req), id, this.actor(req));
    return { ok: true };
  }

  @Post('conversations/:id/messages')
  reply(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    const { text } = parse(replyBody, body);
    return this.panel.reply(this.tenant(req), id, text, this.actor(req));
  }

  @Post('tasks/:id/done')
  @HttpCode(200)
  completeTask(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.panel.completeTask(this.tenant(req), id);
  }

  /** Avisos em tempo real (Server-Sent Events). Só tipo e id; o painel busca o resto. */
  @Sse('events')
  events(@Req() req: AuthedRequest): Observable<MessageEvent> {
    const tenantId = this.tenant(req);
    const notices = new Observable<RealtimeNotice>((subscriber) =>
      this.bus.subscribe(tenantId, (notice) => subscriber.next(notice)),
    ).pipe(map((data): MessageEvent => ({ type: 'notice', data })));
    // Batida a cada 25 s para proxies não fecharem a conexão.
    const heartbeat = interval(25_000).pipe(map((): MessageEvent => ({ type: 'ping', data: '' })));
    return merge(notices, heartbeat);
  }
}
