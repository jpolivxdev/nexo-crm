import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { z } from 'zod';

/** Aviso leve para o painel atualizar sozinho. Nunca carrega dado pessoal, só o que mudou. */
export interface RealtimeNotice {
  type: 'agenda.changed' | 'conversation.updated' | 'handoff.requested' | 'contact.updated';
  id?: string;
}

const CHANNEL = 'nexo_realtime';
const wireSchema = z.object({
  tenantId: z.uuid(),
  notice: z.object({
    type: z.enum([
      'agenda.changed',
      'conversation.updated',
      'handoff.requested',
      'contact.updated',
    ]),
    id: z.uuid().optional(),
  }),
});

/**
 * Barramento de avisos por negócio.
 * Sem conexão: só em memória (um processo). Com `connect`, passa pelo LISTEN/NOTIFY do
 * Postgres, e o worker, o simulador e a API (cada um no seu processo) avisam o mesmo painel.
 */
@Injectable()
export class RealtimeBus {
  private readonly logger = new Logger(RealtimeBus.name);
  private readonly emitter = new EventEmitter();
  private listener: pg.Client | null = null;
  private publisher: pg.Pool | null = null;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  async connect(connectionString: string): Promise<void> {
    const listener = new pg.Client({ connectionString });
    listener.on('error', (error) => this.logger.error(`Tempo real: ${error.message}`));
    listener.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const parsed = wireSchema.safeParse(JSON.parse(msg.payload));
        if (parsed.success) this.emitter.emit(parsed.data.tenantId, parsed.data.notice);
      } catch {
        // aviso malformado: ignora
      }
    });
    await listener.connect();
    await listener.query(`LISTEN ${CHANNEL}`);
    this.listener = listener;
    this.publisher = new pg.Pool({ connectionString, max: 2 });
  }

  publish(tenantId: string, notice: RealtimeNotice): void {
    if (!this.publisher) {
      this.emitter.emit(tenantId, notice);
      return;
    }
    const payload = JSON.stringify({ tenantId, notice });
    this.publisher.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]).catch((error: Error) => {
      this.logger.error(`Tempo real: ${error.message}`);
      this.emitter.emit(tenantId, notice);
    });
  }

  subscribe(tenantId: string, listener: (notice: RealtimeNotice) => void): () => void {
    this.emitter.on(tenantId, listener);
    return () => this.emitter.off(tenantId, listener);
  }

  async close(): Promise<void> {
    await this.listener?.end().catch(() => undefined);
    await this.publisher?.end().catch(() => undefined);
    this.listener = null;
    this.publisher = null;
  }
}
