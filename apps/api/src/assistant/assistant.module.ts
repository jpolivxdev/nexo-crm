import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AI_PROVIDER, GeminiProvider } from './ai-provider.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: AI_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.GEMINI_API_KEY ? new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null,
    },
  ],
})
export class AssistantModule {}
