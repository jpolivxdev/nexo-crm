import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { INBOUND_HANDLER, type InboundHandler } from './inbound-handler.js';
import { JOB_QUEUE, type JobQueue } from './queues.js';

/** Liga a fila de mensagens recebidas a quem as processa (robô + CRM). */
@Injectable()
export class InboundWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(InboundWorker.name);

  constructor(
    @Inject(ENV) private readonly env: Pick<Env, 'RUN_WORKER'>,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(INBOUND_HANDLER) private readonly handler: InboundHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.RUN_WORKER) return;
    await this.queue.workInbound(async (job) => {
      try {
        await this.handler.handleInbound(job.tenantId, job.message);
      } catch (error) {
        // Sem o conteúdo da mensagem no log. A fila tenta de novo.
        this.logger.error(`Falha ao processar mensagem: ${(error as Error).name}`);
        throw error;
      }
    });
  }
}
