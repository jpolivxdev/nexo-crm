import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
