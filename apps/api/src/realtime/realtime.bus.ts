import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

/** Aviso leve para o painel atualizar sozinho. Nunca carrega dado pessoal, só o que mudou. */
export interface RealtimeNotice {
  type: 'agenda.changed' | 'conversation.updated' | 'handoff.requested' | 'contact.updated';
  id?: string;
}

/**
 * Barramento em memória, por negócio. Serve a um servidor só (Fase 1).
 * Com mais de um servidor, troca por LISTEN/NOTIFY do Postgres sem mudar quem usa.
 */
@Injectable()
export class RealtimeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(tenantId: string, notice: RealtimeNotice): void {
    this.emitter.emit(tenantId, notice);
  }

  subscribe(tenantId: string, listener: (notice: RealtimeNotice) => void): () => void {
    this.emitter.on(tenantId, listener);
    return () => this.emitter.off(tenantId, listener);
  }
}
