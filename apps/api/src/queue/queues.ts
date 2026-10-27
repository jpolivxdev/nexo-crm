import type { InboundMessage } from '../channel/channel.types.js';

/** Filas usadas pela aplicação. Criadas por `npm run queue:setup` (scripts/setup-queue.mjs). */
export const INBOUND_QUEUE = 'inbound-message';

export interface InboundJob {
  tenantId: string;
  message: InboundMessage;
}

/** Quem enfileira não sabe se é pg-boss ou uma fila em memória dos testes. */
export interface JobQueue {
  enqueueInbound(job: InboundJob): Promise<void>;
  workInbound(handler: (job: InboundJob) => Promise<void>): Promise<void>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');
