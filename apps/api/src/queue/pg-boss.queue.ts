import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { INBOUND_QUEUE, type InboundJob, type JobQueue } from './queues.js';

/**
 * Fila no próprio Postgres (pg-boss), no schema "pgboss".
 * A aplicação não cria nem migra estrutura: isso é do script de implantação.
 */
export class PgBossQueue implements JobQueue, OnModuleDestroy {
  private readonly logger = new Logger(PgBossQueue.name);
  private readonly boss: PgBoss;
  private started: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      migrate: false,
      createSchema: false,
      schedule: false,
      max: 4,
    });
    // Só a mensagem do erro: o objeto pode carregar dados do job.
    this.boss.on('error', (error) => this.logger.error(error.message));
  }

  private start(): Promise<void> {
    this.started ??= this.boss.start().then(() => undefined);
    return this.started;
  }

  async enqueueInbound(job: InboundJob): Promise<void> {
    await this.start();
    await this.boss.send(INBOUND_QUEUE, job, {
      // Mensagens da mesma pessoa saem da fila uma de cada vez, na ordem.
      group: { id: `${job.tenantId}:${job.message.from}` },
    });
  }

  async workInbound(handler: (job: InboundJob) => Promise<void>): Promise<void> {
    await this.start();
    await this.boss.work<InboundJob>(
      INBOUND_QUEUE,
      { batchSize: 1, localConcurrency: 4, groupConcurrency: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (job) await handler(job.data);
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: true, timeout: 5_000 });
  }
}
