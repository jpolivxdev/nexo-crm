import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Envio de e-mail atrás de uma interface: o provedor real entra depois sem mexer no resto. */
export interface Mailer {
  /** false quando não há como enviar: as telas que dependem de e-mail avisam e não seguem. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Desenvolvimento e testes: não envia nada, mostra no log e guarda na caixa de saída. */
export class ConsoleMailer implements Mailer {
  readonly enabled = true;
  readonly outbox: MailMessage[] = [];
  private readonly logger = new Logger('Mailer');

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 100) this.outbox.shift();
    this.logger.log(
      `E-mail (não enviado, só no log) para ${message.to}: ${message.subject}\n${message.text}`,
    );
  }
}

export class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send(): Promise<void> {
    throw new Error('Envio de e-mail não configurado.');
  }
}

/**
 * Fora de produção, o link aparece no log. Em produção fica desligado até a nexo escolher o
 * provedor de e-mail ([A DEFINIR], ver PENDENCIAS.md): o link com o token nunca vai para o log.
 */
export function createMailer(env: Pick<Env, 'NODE_ENV'>): Mailer {
  if (env.NODE_ENV === 'production') return new DisabledMailer();
  return new ConsoleMailer();
}
