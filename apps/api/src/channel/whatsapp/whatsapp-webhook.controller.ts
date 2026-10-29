import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
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
import { RateLimiter } from '../../auth/rate-limiter.js';
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
  /** Assinaturas erradas por IP: quem tenta forjar é barrado (SEGURANCA.md, A1). */
  private readonly badSignatures = new RateLimiter(20, 15 * 60 * 1000);
  /** Enxurrada de uma cliente só, ou num negócio só, não trava o robô (SEGURANCA.md, A4). */
  private readonly perContact = new RateLimiter(30, 60 * 1000);
  private readonly perTenant = new RateLimiter(600, 60 * 1000);

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
      if (!this.badSignatures.take(req.ip ?? 'desconhecido')) {
        throw new HttpException('Muitas tentativas.', HttpStatus.TOO_MANY_REQUESTS);
      }
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
      // Confirma para a Meta (200) mas não processa: evita reenvio e protege o robô.
      if (!this.perContact.take(`${tenantId}:${message.from}`) || !this.perTenant.take(tenantId)) {
        this.logger.warn('Mensagem acima do limite por contato ou por negócio ignorada.');
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
