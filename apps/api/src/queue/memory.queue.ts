import type { InboundJob, JobQueue } from './queues.js';

/** Fila em memória: roda o job na hora. Usada nos testes e no simulador do terminal. */
export class MemoryQueue implements JobQueue {
  readonly jobs: InboundJob[] = [];
  private handler: ((job: InboundJob) => Promise<void>) | null = null;

  async enqueueInbound(job: InboundJob): Promise<void> {
    this.jobs.push(job);
    if (this.handler) await this.handler(job);
  }

  workInbound(handler: (job: InboundJob) => Promise<void>): Promise<void> {
    this.handler = handler;
    return Promise.resolve();
  }
}
