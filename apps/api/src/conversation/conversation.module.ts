import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module.js';
import { INBOUND_HANDLER } from '../queue/inbound-handler.js';
import { InboundWorker } from '../queue/inbound.worker.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ConversationService } from './conversation.service.js';
import { OWNER_NOTIFIER, PanelOnlyOwnerNotifier } from './owner-notifier.js';

@Module({
  imports: [ChannelModule, SchedulingModule],
  providers: [
    ConversationService,
    { provide: OWNER_NOTIFIER, useClass: PanelOnlyOwnerNotifier },
    { provide: INBOUND_HANDLER, useExisting: ConversationService },
    InboundWorker,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
