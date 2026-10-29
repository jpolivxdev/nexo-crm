/** Normaliza texto livre para comparar comandos: minúsculas, sem acento, sem pontuação nas pontas. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.!?,;:]+|[\s.!?,;:]+$/g, '');
}

const OPT_OUT = new Set(['parar', 'sair', 'pare', 'stop', 'nao quero mais mensagens']);
const MENU = new Set([
  'oi',
  'ola',
  'menu',
  'inicio',
  'comecar',
  'bom dia',
  'boa tarde',
  'boa noite',
  'voltar',
]);
const CANCEL = new Set(['cancelar', 'desmarcar']);
const HUMAN = new Set(['atendente', 'humano', 'pessoa', 'falar com alguem', 'falar com atendente']);

export type GlobalCommand = 'opt_out' | 'menu' | 'cancel' | 'human';

/** Comandos que valem em qualquer ponto da conversa. */
export function globalCommand(text: string): GlobalCommand | null {
  const t = normalize(text);
  if (OPT_OUT.has(t)) return 'opt_out';
  if (MENU.has(t)) return 'menu';
  if (CANCEL.has(t)) return 'cancel';
  if (HUMAN.has(t)) return 'human';
  return null;
}

/** Corta um texto no limite do WhatsApp, terminando com reticências se precisar. */
export function clip(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}
