import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env.js';
import { ChannelModule } from './channel/channel.module.js';
import { ConversationModule } from './conversation/conversation.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { loggerParams } from './logger.js';
import { QueueModule } from './queue/queue.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
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
        SchedulingModule,
        ChannelModule,
        ConversationModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
