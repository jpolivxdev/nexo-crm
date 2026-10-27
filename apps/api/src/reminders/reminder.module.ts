import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module.js';
import { ReminderService } from './reminder.service.js';
import { ReminderWorker } from './reminder.worker.js';

@Module({
  imports: [ChannelModule],
  providers: [ReminderService, ReminderWorker],
  exports: [ReminderService],
})
export class ReminderModule {}
