import { Injectable, Logger } from '@nestjs/common';

/**
 * Aviso para a dona quando uma cliente pede para falar com ela.
 * Fase 1: aparece no painel (tempo real + "A fazer") e, se a dona ligou, por e-mail
 * (`OwnerAlerts`). O aviso pelo WhatsApp da dona entra
 * quando a conta da Meta estiver liberada (mensagem de modelo aprovada).
 */
export interface OwnerNotifier {
  handoffRequested(
    tenantId: string,
    info: { contactId: string; conversationId: string },
  ): Promise<void>;
}

export const OWNER_NOTIFIER = Symbol('OWNER_NOTIFIER');

@Injectable()
export class PanelOnlyOwnerNotifier implements OwnerNotifier {
  private readonly logger = new Logger('OwnerNotifier');

  handoffRequested(): Promise<void> {
    this.logger.log('Pedido de atendimento humano registrado no painel.');
    return Promise.resolve();
  }
}
