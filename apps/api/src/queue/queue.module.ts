import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PgBossQueue } from './pg-boss.queue.js';
import { JOB_QUEUE } from './queues.js';

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) => new PgBossQueue(env.DATABASE_URL),
    },
  ],
  exports: [JOB_QUEUE],
})
export class QueueModule {}
