import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env.js';
import { SupportModule } from './support/support.module.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { WikiModule } from './wiki/wiki.module.js';
import { BoardModule } from './board/board.module.js';
import { ChannelModule } from './channel/channel.module.js';
import { ConversationModule } from './conversation/conversation.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { loggerParams } from './logger.js';
import { CrmModule } from './crm/crm.module.js';
import { PanelModule } from './panel/panel.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { ReminderModule } from './reminders/reminder.module.js';
import { SetupModule } from './setup/setup.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot(loggerParams(env)),
        DatabaseModule,
        RealtimeModule,
        QueueModule,
        AuthModule,
        SchedulingModule,
        ChannelModule,
        ConversationModule,
        PanelModule,
        CrmModule,
        ChatModule,
        WikiModule,
        BoardModule,
        SetupModule,
        AdminModule,
        SupportModule,
        AssistantModule,
        ReminderModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
