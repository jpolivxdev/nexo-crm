import { Global, Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { RealtimeBus } from './realtime.bus.js';

@Global()
@Module({ providers: [RealtimeBus], exports: [RealtimeBus] })
export class RealtimeModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly bus: RealtimeBus,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.REALTIME_CROSS_PROCESS) await this.bus.connect(this.env.DATABASE_URL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.bus.close();
  }
}
