import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ENV, type Env } from '../../config/env.js';
import { JOB_QUEUE, type JobQueue } from '../../queue/queues.js';
import { ChannelRouter } from '../channel.router.js';
import { MessageStatusService } from '../message-status.service.js';
import { isValidSignature } from './signature.js';
import { parseWebhook } from './webhook-payload.js';

/**
 * Webhook da WhatsApp Cloud API.
 * Confere a assinatura antes de tudo, valida o formato, enfileira e responde 200 rápido.
 * O processamento (robô, CRM) roda no worker, fora da requisição.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly router: ChannelRouter,
    private readonly statuses: MessageStatusService,
  ) {}

  /** Verificação do webhook no painel da Meta. */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected || mode !== 'subscribe' || !token || !challenge || !sameSecret(token, expected)) {
      throw new ForbiddenException();
    }
    // Só devolve o desafio se for um número, como a Meta manda: nada de refletir texto livre.
    if (!/^\d{1,64}$/.test(challenge)) throw new ForbiddenException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ ok: true }> {
    const secret = this.env.WHATSAPP_APP_SECRET;
    if (!secret) throw new ServiceUnavailableException();
    if (!isValidSignature(req.rawBody, signature, secret)) {
      this.logger.warn('Webhook com assinatura inválida recusado.');
      throw new UnauthorizedException();
    }

    const parsed = parseWebhook(req.body);
    // Formato inesperado com assinatura válida: confirma para a Meta não reenviar sem fim.
    if (!parsed) {
      this.logger.warn('Webhook assinado com formato inesperado ignorado.');
      return { ok: true };
    }

    for (const message of parsed.messages) {
      const tenantId = await this.router.tenantFor('whatsapp', message.businessExternalId);
      if (!tenantId) {
        this.logger.warn('Mensagem para um número sem negócio ligado ignorada.');
        continue;
      }
      await this.queue.enqueueInbound({ tenantId, message });
    }
    for (const status of parsed.statuses) {
      const tenantId = await this.router.tenantFor('whatsapp', status.businessExternalId);
      if (tenantId) await this.statuses.update(tenantId, status);
    }
    return { ok: true };
  }
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
