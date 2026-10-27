import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module.js';
import { ConversationModule } from '../conversation/conversation.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { PanelController } from './panel.controller.js';
import { ReportService } from '../report/report.service.js';
import { PanelService } from './panel.service.js';

@Module({
  imports: [ChannelModule, ConversationModule, SchedulingModule],
  controllers: [PanelController],
  providers: [PanelService, ReportService],
})
export class PanelModule {}
