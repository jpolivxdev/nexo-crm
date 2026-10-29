import { Module } from '@nestjs/common';
import { ChannelRegistry } from './channel.registry.js';
import { ChannelRouter } from './channel.router.js';
import { MessageStatusService } from './message-status.service.js';
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller.js';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [ChannelRouter, ChannelRegistry, MessageStatusService],
  exports: [ChannelRouter, ChannelRegistry],
})
export class ChannelModule {}
