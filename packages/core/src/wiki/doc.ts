/**
 * Texto dos artigos da Wiki: um formato simples, escrito com a barra do editor.
 *
 *   ## Título        ### Subtítulo
 *   - item           1. item
 *   > destaque
 *   **negrito**  _itálico_  `código`  [texto](https://endereço)
 *   ![legenda](anexo:ID)   (imagem anexada ao artigo, numa linha sozinha)
 *
 * Vira uma lista de blocos para a tela desenhar com elementos próprios: nada de HTML vindo do
 * texto, então não há como injetar script. Links só para http(s), mailto e telas do painel (#/).
 */
export type Span =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; level: 2 | 3; spans: Span[] }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'list'; ordered: boolean; items: Span[][] }
  | { type: 'quote'; spans: Span[] }
  | { type: 'image'; attachmentId: string; alt: string };

const SAFE_LINK = /^(https?:\/\/|mailto:|#\/)/i;
const IMAGE = /^!\[([^\]]*)\]\(anexo:([0-9a-f-]{36})\)$/i;
const INLINE = /\*\*(.+?)\*\*|_(.+?)_|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  const push = (span: Span) => {
    const last = spans.at(-1);
    if (span.type === 'text' && last?.type === 'text') last.text += span.text;
    else if (span.text) spans.push(span);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    push({ type: 'text', text: text.slice(at, index) });
    if (m[1] !== undefined) push({ type: 'bold', text: m[1] });
    else if (m[2] !== undefined) push({ type: 'italic', text: m[2] });
    else if (m[3] !== undefined) push({ type: 'code', text: m[3] });
    else if (m[4] !== undefined && m[5] !== undefined) {
      if (SAFE_LINK.test(m[5])) push({ type: 'link', text: m[4], href: m[5] });
      else push({ type: 'text', text: m[0] });
    }
    at = index + m[0].length;
  }
  push({ type: 'text', text: text.slice(at) });
  return spans;
}

export function parseDoc(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Span[][] } | null = null;

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: 'list', ...list });
      list = null;
    }
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(trimmed);
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    const quote = /^>\s?(.*)$/.exec(trimmed);
    const image = IMAGE.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        type: 'heading',
        level: heading[1]!.length === 2 ? 2 : 3,
        spans: parseInline(heading[2]!),
      });
    } else if (image) {
      flush();
      blocks.push({ type: 'image', alt: image[1]!, attachmentId: image[2]!.toLowerCase() });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]!));
    } else if (quote) {
      flush();
      const last = blocks.at(-1);
      const spans = parseInline(quote[1]!);
      if (last?.type === 'quote') last.spans.push({ type: 'text', text: '\n' }, ...spans);
      else blocks.push({ type: 'quote', spans });
    } else {
      if (list) flush();
      paragraph.push(trimmed);
    }
  }
  flush();
  return blocks;
}

/** Texto corrido, sem marcação: para a busca mostrar um trecho e para o resumo da lista. */
export function plainText(source: string): string {
  return parseDoc(source)
    .map((b) => {
      if (b.type === 'image') return b.alt;
      const spans = b.type === 'list' ? b.items.flat() : b.spans;
      return spans.map((s) => s.text).join('');
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trecho em volta da primeira ocorrência da busca (sem diferenciar acento e maiúscula). */
export function snippet(text: string, query: string, size = 140): string {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = fold(query.trim());
  const at = q ? fold(text).indexOf(q) : -1;
  if (at < 0) return text.length > size ? `${text.slice(0, size).trimEnd()}…` : text;
  const start = Math.max(0, at - Math.floor((size - q.length) / 2));
  const end = Math.min(text.length, start + size);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
