import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { createPrismaClient, type PrismaClient, type TenantTx, withTenant } from './prisma.js';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /**
   * Acesso sem negócio definido. Pelo RLS, só enxerga tabelas sem tenant_id (ex.: users).
   * Use só em autenticação e verificações técnicas.
   */
  readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
  }

  /** Transação presa a um negócio. É o caminho normal para dados de negócio. */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.client, tenantId, fn);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
