import { clip } from './text.js';

/** Limites da WhatsApp Cloud API para mensagens interativas. */
export const LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  listButton: 20,
  body: 1024,
} as const;

export interface Choice {
  id: string;
  title: string;
  description?: string;
}

export type OutgoingMessage =
  | { type: 'text'; body: string }
  | { type: 'buttons'; body: string; buttons: Choice[] }
  | { type: 'list'; body: string; button: string; rows: Choice[] };

export const text = (body: string): OutgoingMessage => ({ type: 'text', body: clip(body, 4096) });

/**
 * Monta a pergunta com opções do jeito certo para o WhatsApp:
 * até 3 opções curtas viram botões; mais que isso vira lista (até 10 linhas).
 * Quem chama cuida da paginação acima de 10.
 */
export function choices(
  body: string,
  options: Choice[],
  listButton = 'Ver opções',
): OutgoingMessage {
  if (options.length === 0) throw new Error('Pergunta sem opções.');
  if (options.length > LIMITS.listRows) throw new Error('Mais de 10 opções: pagine antes.');

  const fitsButtons =
    options.length <= LIMITS.buttons &&
    options.every((o) => [...o.title].length <= LIMITS.buttonTitle && !o.description);

  if (fitsButtons) {
    return { type: 'buttons', body: clip(body, LIMITS.body), buttons: options };
  }
  return {
    type: 'list',
    body: clip(body, LIMITS.body),
    button: clip(listButton, LIMITS.listButton),
    rows: options.map((o) => ({
      id: o.id,
      title: clip(o.title, LIMITS.rowTitle),
      ...(o.description ? { description: clip(o.description, LIMITS.rowDescription) } : {}),
    })),
  };
}
