/**
 * Quadro branco: os elementos que a tela desenha e o servidor guarda (JSON).
 * Coordenadas em pixels do quadro (antes do zoom). Setas e linhas vão de (x, y) até
 * (x + w, y + h); formas, imagem e texto ocupam o retângulo (x, y, w, h).
 */
export const BOARD_COLORS = [
  '#100C24', // Tinta
  '#6A1FE8', // Roxo Nexo
  '#2F5BFF', // Azul Elo
  '#A98BFF', // Lavanda
  '#16A34A', // verde
  '#D97706', // laranja
  '#565170', // Grafite
] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

export const BOARD_WIDTHS = [2, 4, 8] as const;
export const TEXT_SIZES = [16, 24, 36] as const;

export const BOARD_MAX_ELEMENTS = 2000;
export const BOARD_MAX_POINTS = 50_000;
export const BOARD_MAX_TEXT = 2000;
const MAX_COORD = 1_000_000;

interface Base {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: BoardColor;
}

export type BoardElement =
  | (Base & { type: 'rect' | 'ellipse'; width: number; fill: boolean })
  | (Base & { type: 'arrow' | 'line'; width: number })
  | (Base & { type: 'text'; text: string; size: number })
  | (Base & { type: 'pen'; width: number; points: [number, number][] })
  | (Base & { type: 'image'; fileId: string });

export type BoardElementType = BoardElement['type'];

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Confere e limpa o que veio da tela: só os campos conhecidos, cores da lista, tamanhos da
 * lista e limites de quantidade. Devolve os elementos limpos ou o motivo da recusa.
 */
export function checkBoard(
  input: unknown,
): { ok: true; elements: BoardElement[]; fileIds: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Quadro inválido.' };
  if (input.length > BOARD_MAX_ELEMENTS) {
    return {
      ok: false,
      error: `O quadro passou de ${BOARD_MAX_ELEMENTS} itens. Use outro quadro.`,
    };
  }
  const out: BoardElement[] = [];
  const ids = new Set<string>();
  const fileIds = new Set<string>();
  let points = 0;
  for (const raw of input) {
    if (!isObj(raw)) return { ok: false, error: 'Item inválido no quadro.' };
    const { id, type, x, y, w, h, color } = raw;
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) {
      return { ok: false, error: 'Item inválido no quadro.' };
    }
    if (![x, y, w, h].every(isNum)) return { ok: false, error: 'Posição inválida no quadro.' };
    if (!BOARD_COLORS.includes(color as BoardColor)) {
      return { ok: false, error: 'Cor fora da paleta.' };
    }
    ids.add(id);
    const base = { id, x, y, w, h, color: color as BoardColor } as Base;
    const width = BOARD_WIDTHS.includes(raw.width as 2) ? (raw.width as number) : 2;
    switch (type) {
      case 'rect':
      case 'ellipse':
        out.push({ ...base, type, width, fill: raw.fill === true });
        break;
      case 'arrow':
      case 'line':
        out.push({ ...base, type, width });
        break;
      case 'text': {
        if (typeof raw.text !== 'string' || raw.text.length > BOARD_MAX_TEXT) {
          return { ok: false, error: `Texto do quadro com mais de ${BOARD_MAX_TEXT} letras.` };
        }
        const size = TEXT_SIZES.includes(raw.size as 16) ? (raw.size as number) : 24;
        out.push({ ...base, type, text: raw.text, size });
        break;
      }
      case 'pen': {
        const pts = raw.points;
        if (!Array.isArray(pts) || pts.length < 1) {
          return { ok: false, error: 'Traço inválido no quadro.' };
        }
        points += pts.length;
        if (points > BOARD_MAX_POINTS) {
          return { ok: false, error: 'O quadro tem traços demais. Use outro quadro.' };
        }
        const clean: [number, number][] = [];
        for (const p of pts) {
          if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) {
            return { ok: false, error: 'Traço inválido no quadro.' };
          }
          clean.push([p[0], p[1]]);
        }
        out.push({ ...base, type, width, points: clean });
        break;
      }
      case 'image':
        if (typeof raw.fileId !== 'string' || !UUID.test(raw.fileId)) {
          return { ok: false, error: 'Imagem inválida no quadro.' };
        }
        fileIds.add(raw.fileId.toLowerCase());
        out.push({ ...base, type, fileId: raw.fileId.toLowerCase() });
        break;
      default:
        return { ok: false, error: 'Tipo de item desconhecido no quadro.' };
    }
  }
  return { ok: true, elements: out, fileIds: [...fileIds] };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo com largura e altura positivas (setas e formas podem ter sido puxadas ao contrário). */
export function normalBox(b: Box): Box {
  return {
    x: Math.min(b.x, b.x + b.w),
    y: Math.min(b.y, b.y + b.h),
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

/** Área que o elemento ocupa (para seleção, enquadrar e a miniatura). */
export function elementBox(el: BoardElement): Box {
  if (el.type === 'pen') {
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return normalBox(el);
}

/** Área de todos os elementos juntos, ou nulo para quadro vazio. */
export function boardBounds(elements: readonly BoardElement[]): Box | null {
  if (elements.length === 0) return null;
  const boxes = elements.map(elementBox);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** O ponto (x, y) toca o elemento? `tol` é a folga em pixels do quadro. */
export function hitTest(el: BoardElement, x: number, y: number, tol = 6): boolean {
  switch (el.type) {
    case 'arrow':
    case 'line':
      return distToSegment(x, y, el.x, el.y, el.x + el.w, el.y + el.h) <= tol + el.width / 2;
    case 'pen': {
      const pts = el.points;
      if (pts.length === 1) return Math.hypot(x - pts[0]![0], y - pts[0]![1]) <= tol + el.width;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!;
        const [bx, by] = pts[i]!;
        if (distToSegment(x, y, ax, ay, bx, by) <= tol + el.width / 2) return true;
      }
      return false;
    }
    case 'ellipse': {
      const b = normalBox(el);
      const rx = b.w / 2 + tol;
      const ry = b.h / 2 + tol;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (x - (b.x + b.w / 2)) / rx;
      const ny = (y - (b.y + b.h / 2)) / ry;
      return nx * nx + ny * ny <= 1;
    }
    default: {
      const b = normalBox(el);
      return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
    }
  }
}

/** Elemento de cima que está no ponto (o último desenhado fica por cima). */
export function topAt(elements: readonly BoardElement[], x: number, y: number, tol = 6) {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (hitTest(elements[i]!, x, y, tol)) return elements[i]!;
  }
  return null;
}

/** Move o elemento (dx, dy). */
export function moveElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  if (el.type === 'pen') {
    return {
      ...el,
      x: el.x + dx,
      y: el.y + dy,
      points: el.points.map(([px, py]) => [px + dx, py + dy] as [number, number]),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

/** Traço do lápis: guarda o retângulo junto com os pontos. */
export function penElement(
  id: string,
  points: [number, number][],
  color: BoardColor,
  width: number,
): BoardElement {
  const el = { id, type: 'pen' as const, x: 0, y: 0, w: 0, h: 0, color, width, points };
  return { ...el, ...elementBox(el) };
}
