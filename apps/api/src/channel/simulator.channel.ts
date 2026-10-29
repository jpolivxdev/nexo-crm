import type { OutgoingMessage } from '@nexo/core';
import type { MessagingChannel } from './channel.types.js';

/** Canal falso para testar o robô sem a Meta: entrega as respostas para quem estiver ouvindo. */
export class SimulatorChannel implements MessagingChannel {
  readonly name = 'simulator' as const;
  private counter = 0;

  constructor(private readonly deliver: (to: string, message: OutgoingMessage) => void) {}

  send(to: string, message: OutgoingMessage): Promise<{ externalId: string | null }> {
    this.deliver(to, message);
    this.counter += 1;
    return Promise.resolve({ externalId: `sim-out-${Date.now()}-${this.counter}` });
  }
}
