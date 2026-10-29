import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module.js';
import { INBOUND_HANDLER } from '../queue/inbound-handler.js';
import { InboundWorker } from '../queue/inbound.worker.js';
import { OwnerAlerts } from '../scheduling/owner-alerts.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ConversationService } from './conversation.service.js';
import { OWNER_NOTIFIER } from './owner-notifier.js';

@Module({
  imports: [ChannelModule, SchedulingModule],
  providers: [
    ConversationService,
    // Painel em tempo real sempre; e-mail quando a dona liga em Conta → Avisos.
    { provide: OWNER_NOTIFIER, useExisting: OwnerAlerts },
    { provide: INBOUND_HANDLER, useExisting: ConversationService },
    InboundWorker,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
