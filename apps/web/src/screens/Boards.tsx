import {
  BOARD_COLORS,
  BOARD_WIDTHS,
  boardBounds,
  elementBox,
  moveElement,
  penElement,
  TEXT_SIZES,
  topAt,
  type BoardColor,
  type BoardElement,
} from '@nexo/core';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Circle,
  Hand,
  ImagePlus,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  PenLine,
  Plus,
  Presentation,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError, sendRaw, uploadFile } from '../lib/api';
import { BUSINESS_TZ_FALLBACK, dateTime } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

interface BoardRow {
  id: string;
  title: string;
  updatedAt: string;
  updatedByName: string;
  count: number;
  preview: BoardElement[] | null;
  canArchive: boolean;
}

interface BoardData {
  id: string;
  title: string;
  elements: BoardElement[];
  version: number;
  updatedAt: string;
  updatedByName: string;
  canArchive: boolean;
}

type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'text' | 'pen';

const TOOLS: { id: Tool; label: string; Icon: typeof Square; key: string }[] = [
  { id: 'select', label: 'Selecionar e mover', Icon: MousePointer2, key: 'v' },
  { id: 'hand', label: 'Arrastar o quadro', Icon: Hand, key: 'h' },
  { id: 'rect', label: 'Retângulo', Icon: Square, key: 'r' },
  { id: 'ellipse', label: 'Círculo', Icon: Circle, key: 'o' },
  { id: 'arrow', label: 'Seta', Icon: ArrowUpRight, key: 'a' },
  { id: 'line', label: 'Linha', Icon: Slash, key: 'l' },
  { id: 'text', label: 'Texto', Icon: Type, key: 't' },
  { id: 'pen', label: 'Lápis', Icon: PenLine, key: 'p' },
];

const COLOR_NAME: Record<BoardColor, string> = {
  '#100C24': 'Tinta',
  '#6A1FE8': 'Roxo',
  '#2F5BFF': 'Azul',
  '#A98BFF': 'Lavanda',
  '#16A34A': 'Verde',
  '#D97706': 'Laranja',
  '#565170': 'Grafite',
};

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fileUrl = (id: string) => `/api/panel/boards/files/${id}`;
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);

/** Tamanho aproximado do texto, para seleção e enquadramento. */
function textBox(text: string, size: number) {
  const lines = (text || ' ').split('\n');
  return {
    w: Math.max(24, Math.max(...lines.map((l) => l.length)) * size * 0.58),
    h: lines.length * size * 1.3,
  };
}

/**
 * Quadro branco (Premium): quadros salvos por negócio, com formas, setas, linhas, texto, lápis e
 * imagem. Rotas: /quadros e /quadros/:id.
 */
export function Boards({ id, go }: { id: string | null; go: (to: string) => void }) {
  return id ? <Editor key={id} id={id} go={go} /> : <BoardList go={go} />;
}

function BoardList({ go }: { go: (to: string) => void }) {
  const list = useLoad(() => api<{ boards: BoardRow[] }>('/panel/boards'), 'boards');
  const [creating, setCreating] = useState(false);
  useRealtime((n) => {
    if (n.type === 'board.updated') void list.reload();
  });
  const boards = list.data?.boards ?? [];

  return (
    <>
      <PageHeader
        Icon={Presentation}
        title="Quadro branco"
        subtitle="Rascunhe ideias, fluxos e combinados com a equipe. Tudo fica salvo no negócio."
      />
      <section className="card boards" aria-label="Quadros">
        <div className="row row--between boards__bar">
          <h2 className="small">Quadros do negócio</h2>
          <button type="button" className="button button--small" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" size={16} /> Novo quadro
          </button>
        </div>
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error && !list.data ? (
          <Banner>{list.error}</Banner>
        ) : boards.length === 0 ? (
          <Empty title="Nenhum quadro ainda" icon={<Presentation size={24} />}>
            Crie um quadro para desenhar o passo a passo de um atendimento, planejar a semana ou
            juntar ideias com a equipe.
          </Empty>
        ) : (
          <ul className="boards__grid">
            {boards.map((b) => (
              <li key={b.id}>
                <a href={`#/quadros/${b.id}`} className="boards__card">
                  <span className="boards__thumb" aria-hidden="true">
                    {b.preview && b.preview.length > 0 ? (
                      <Preview elements={b.preview} />
                    ) : (
                      <Presentation size={28} />
                    )}
                  </span>
                  <strong>{b.title}</strong>
                  <span className="muted small">
                    {b.count === 1 ? '1 item' : `${b.count} itens`} · {b.updatedByName},{' '}
                    {dateTime(b.updatedAt, BUSINESS_TZ_FALLBACK)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {creating && (
        <NewBoard
          onClose={() => setCreating(false)}
          onDone={(newBoard) => {
            setCreating(false);
            go(`/quadros/${newBoard}`);
          }}
        />
      )}
    </>
  );
}

function NewBoard({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string }>('/panel/boards', { method: 'POST', body: { title } });
      onDone(res.id);
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar o quadro.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Novo quadro" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome do quadro
          <input
            value={title}
            maxLength={80}
            placeholder="Ex.: Fluxo do primeiro atendimento"
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button" disabled={busy || title.trim().length < 2}>
          Criar e abrir
        </button>
      </form>
    </Sheet>
  );
}

/** Miniatura da lista: o desenho inteiro encaixado no cartão. */
function Preview({ elements }: { elements: BoardElement[] }) {
  const b = boardBounds(elements) ?? { x: 0, y: 0, w: 100, h: 60 };
  const pad = 16;
  return (
    <svg
      viewBox={`${b.x - pad} ${b.y - pad} ${Math.max(b.w, 40) + pad * 2} ${Math.max(b.h, 40) + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {elements.map((el) => (
        <Shape key={el.id} el={el} />
      ))}
    </svg>
  );
}

function arrowHead(el: BoardElement) {
  const x2 = el.x + el.w;
  const y2 = el.y + el.h;
  const angle = Math.atan2(el.h, el.w);
  const size = 10 + ('width' in el ? el.width * 2 : 4);
  const p = (a: number) => `${x2 - size * Math.cos(a)},${y2 - size * Math.sin(a)}`;
  return `${x2},${y2} ${p(angle - Math.PI / 7)} ${p(angle + Math.PI / 7)}`;
}

/** Um elemento desenhado em SVG. Nada de HTML: texto é texto. */
function Shape({ el }: { el: BoardElement }) {
  switch (el.type) {
    case 'rect': {
      const b = elementBox(el);
      return (
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={8}
          stroke={el.color}
          strokeWidth={el.width}
          fill={el.fill ? el.color : 'none'}
          fillOpacity={el.fill ? 0.16 : undefined}
        />
      );
    }
    case 'ellipse': {
      const b = elementBox(el);
      return (
        <ellipse
          cx={b.x + b.w / 2}
          cy={b.y + b.h / 2}
          rx={b.w / 2}
          ry={b.h / 2}
          stroke={el.color}
          strokeWidth={el.width}
          fill={el.fill ? el.color : 'none'}
          fillOpacity={el.fill ? 0.16 : undefined}
        />
      );
    }
    case 'line':
    case 'arrow':
      return (
        <g stroke={el.color} strokeWidth={el.width} strokeLinecap="round">
          <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} />
          {el.type === 'arrow' && (
            <polygon points={arrowHead(el)} fill={el.color} strokeLinejoin="round" />
          )}
        </g>
      );
    case 'pen':
      return (
        <path
          d={
            el.points.length === 1
              ? `M${el.points[0]![0]},${el.points[0]![1]} l0.1,0`
              : `M${el.points.map((p) => `${p[0]},${p[1]}`).join(' L')}`
          }
          stroke={el.color}
          strokeWidth={el.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'text':
      return (
        <text
          x={el.x}
          y={el.y}
          fill={el.color}
          fontSize={el.size}
          fontFamily="Inter, system-ui, sans-serif"
          dominantBaseline="hanging"
        >
          {el.text.split('\n').map((line, i) => (
            <tspan key={i} x={el.x} dy={i === 0 ? 0 : el.size * 1.3}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      );
    case 'image':
      return (
        <image
          href={fileUrl(el.fileId)}
          x={el.x}
          y={el.y}
          width={Math.abs(el.w)}
          height={Math.abs(el.h)}
          preserveAspectRatio="none"
        />
      );
  }
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; id: string; lx: number; ly: number; moved: boolean }
  | { kind: 'draw'; id: string; ox: number; oy: number }
  | { kind: 'pen'; id: string; points: [number, number][] }
  | { kind: 'handle'; id: string; handle: 'start' | 'end' | 'corner' };

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

function Editor({ id, go }: { id: string; go: (to: string) => void }) {
  const load = useLoad(() => api<BoardData>(`/panel/boards/${id}`), `board-${id}`);
  if (load.loading && !load.data) return <Loading />;
  if (load.error && !load.data) {
    return (
      <>
        <button type="button" className="link" onClick={() => go('/quadros')}>
          Voltar para os quadros
        </button>
        <Banner>{load.error}</Banner>
      </>
    );
  }
  if (!load.data) return null;
  return <Canvas board={load.data} go={go} />;
}

function Canvas({ board, go }: { board: BoardData; go: (to: string) => void }) {
  const [elements, setElements] = useState<BoardElement[]>(board.elements);
  const [title, setTitle] = useState(board.title);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<BoardColor>(BOARD_COLORS[1]);
  const [width, setWidth] = useState<number>(BOARD_WIDTHS[0]);
  const [fill, setFill] = useState(false);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZES[1]);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [save, setSave] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const version = useRef(board.version);
  const past = useRef<BoardElement[][]>([]);
  const future = useRef<BoardElement[][]>([]);
  const before = useRef<BoardElement[] | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(elements);
  useLayoutEffect(() => {
    latest.current = elements;
  }, [elements]);
  const saving = useRef(false);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: past.current.length, redo: future.current.length });
  const [size, setSize] = useState({ w: 800, h: 500 });

  // Tamanho da área de desenho (para o zoom e o enquadramento).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedEl = elements.find((e) => e.id === selected) ?? null;

  // Enquadra o desenho na primeira abertura.
  const fit = useCallback(() => {
    const el = svg.current;
    const b = boardBounds(latest.current);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!b || rect.width === 0) {
      setView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const pad = 40;
    const zoom = Math.min(
      2,
      Math.max(0.2, Math.min(rect.width / (b.w + pad * 2), rect.height / (b.h + pad * 2))),
    );
    setView({
      zoom,
      x: b.x + b.w / 2 - rect.width / zoom / 2,
      y: b.y + b.h / 2 - rect.height / zoom / 2,
    });
  }, []);
  useEffect(() => {
    fit();
  }, [fit]);

  // ---------- salvar ----------
  const persist = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setSave('saving');
    const sent = latest.current;
    try {
      const res = await sendRaw<{ version: number }>(
        `/panel/boards/${board.id}`,
        'PUT',
        JSON.stringify({ elements: sent, version: version.current }),
      );
      version.current = res.version;
      setSave(latest.current === sent ? 'saved' : 'dirty');
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSave('conflict');
      } else {
        setSave('error');
        setError(errorText(e, 'Não foi possível salvar.'));
      }
    } finally {
      saving.current = false;
    }
  }, [board.id]);

  useEffect(() => {
    if (save !== 'dirty') return;
    const handle = window.setTimeout(() => void persist(), 900);
    return () => window.clearTimeout(handle);
  }, [save, elements, persist]);

  // Outra pessoa salvou: se não há nada pendente aqui, traz a versão nova.
  useRealtime((n) => {
    if (n.type !== 'board.updated' || n.id !== board.id) return;
    if (save === 'dirty' || saving.current) return;
    void api<BoardData>(`/panel/boards/${board.id}`)
      .then((fresh) => {
        if (fresh.version > version.current) {
          version.current = fresh.version;
          setElements(fresh.elements);
          setTitle(fresh.title);
          setSave('saved');
        }
      })
      .catch(() => undefined);
  });

  async function reloadLatest() {
    try {
      const fresh = await api<BoardData>(`/panel/boards/${board.id}`);
      version.current = fresh.version;
      past.current = [];
      future.current = [];
      syncHist();
      setElements(fresh.elements);
      setTitle(fresh.title);
      setSave('saved');
    } catch (e) {
      setError(errorText(e, 'Não foi possível abrir de novo.'));
    }
  }

  // ---------- histórico ----------
  function commit(next: BoardElement[], from: BoardElement[] = elements) {
    past.current = [...past.current.slice(-99), from];
    future.current = [];
    syncHist();
    setElements(next);
    setSave('dirty');
  }
  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(elements);
    syncHist();
    setElements(prev);
    setSelected(null);
    setSave('dirty');
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(elements);
    syncHist();
    setElements(next);
    setSave('dirty');
  }
  function removeSelected() {
    if (!selected) return;
    commit(elements.filter((e) => e.id !== selected));
    setSelected(null);
  }
  function patchSelected(patch: Partial<BoardElement>) {
    if (!selectedEl) return;
    commit(
      elements.map((e) => (e.id === selectedEl.id ? ({ ...e, ...patch } as BoardElement) : e)),
    );
  }

  // ---------- coordenadas ----------
  const point = (ev: { clientX: number; clientY: number }): [number, number] => {
    const rect = svg.current!.getBoundingClientRect();
    return [
      (ev.clientX - rect.left) / view.zoom + view.x,
      (ev.clientY - rect.top) / view.zoom + view.y,
    ];
  };

  function zoomAt(factor: number, cx?: number, cy?: number) {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const px = cx ?? rect.width / 2;
    const py = cy ?? rect.height / 2;
    setView((v) => {
      const zoom = Math.min(4, Math.max(0.2, v.zoom * factor));
      const bx = px / v.zoom + v.x;
      const by = py / v.zoom + v.y;
      return { zoom, x: bx - px / zoom, y: by - py / zoom };
    });
  }

  // ---------- ponteiro ----------
  function handleAt(x: number, y: number): 'start' | 'end' | 'corner' | null {
    if (!selectedEl || selectedEl.type === 'pen') return null;
    const r = 10 / view.zoom;
    if (selectedEl.type === 'arrow' || selectedEl.type === 'line') {
      if (Math.hypot(x - selectedEl.x, y - selectedEl.y) <= r) return 'start';
      if (Math.hypot(x - (selectedEl.x + selectedEl.w), y - (selectedEl.y + selectedEl.h)) <= r) {
        return 'end';
      }
      return null;
    }
    if (selectedEl.type === 'text') return null;
    const b = elementBox(selectedEl);
    return Math.hypot(x - (b.x + b.w), y - (b.y + b.h)) <= r ? 'corner' : null;
  }

  function onDown(ev: ReactPointerEvent<SVGSVGElement>) {
    if (ev.button === 2) return;
    svg.current?.setPointerCapture?.(ev.pointerId);
    const [x, y] = point(ev);
    before.current = elements;
    if (tool === 'hand' || ev.button === 1) {
      drag.current = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (tool === 'select') {
      const handle = handleAt(x, y);
      if (handle && selected) {
        drag.current = { kind: 'handle', id: selected, handle };
        return;
      }
      const hit = topAt(elements, x, y, 6 / view.zoom);
      if (hit) {
        setSelected(hit.id);
        drag.current = { kind: 'move', id: hit.id, lx: x, ly: y, moved: false };
      } else {
        setSelected(null);
        drag.current = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
      }
      return;
    }
    const id = newId();
    if (tool === 'pen') {
      drag.current = { kind: 'pen', id, points: [[x, y]] };
      setElements([...elements, penElement(id, [[x, y]], color, width)]);
      return;
    }
    if (tool === 'text') {
      const box = textBox('', textSize);
      const el: BoardElement = { id, type: 'text', x, y, ...box, color, text: '', size: textSize };
      commit([...elements, el]);
      setSelected(id);
      setTool('select');
      requestAnimationFrame(() => textInput.current?.focus());
      return;
    }
    const base = { id, x, y, w: 0, h: 0, color };
    const el: BoardElement =
      tool === 'rect' || tool === 'ellipse'
        ? { ...base, type: tool, width, fill }
        : { ...base, type: tool, width };
    drag.current = { kind: 'draw', id, ox: x, oy: y };
    setElements([...elements, el]);
  }

  function onMove(ev: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setView((v) => ({
        ...v,
        x: d.vx - (ev.clientX - d.sx) / v.zoom,
        y: d.vy - (ev.clientY - d.sy) / v.zoom,
      }));
      return;
    }
    const [x, y] = point(ev);
    if (d.kind === 'move') {
      const dx = x - d.lx;
      const dy = y - d.ly;
      d.lx = x;
      d.ly = y;
      d.moved = true;
      setElements((list) => list.map((e) => (e.id === d.id ? moveElement(e, dx, dy) : e)));
    } else if (d.kind === 'draw') {
      setElements((list) =>
        list.map((e) => {
          if (e.id !== d.id) return e;
          if (ev.shiftKey && (e.type === 'rect' || e.type === 'ellipse')) {
            const s = Math.max(Math.abs(x - d.ox), Math.abs(y - d.oy));
            return { ...e, w: Math.sign(x - d.ox || 1) * s, h: Math.sign(y - d.oy || 1) * s };
          }
          return { ...e, w: x - d.ox, h: y - d.oy };
        }),
      );
    } else if (d.kind === 'pen') {
      const last = d.points[d.points.length - 1]!;
      if (Math.hypot(x - last[0], y - last[1]) < 2 / view.zoom) return;
      d.points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      const pts = [...d.points];
      setElements((list) =>
        list.map((e) => (e.id === d.id ? penElement(d.id, pts, color, width) : e)),
      );
    } else if (d.kind === 'handle') {
      setElements((list) =>
        list.map((e) => {
          if (e.id !== d.id) return e;
          if (d.handle === 'start') return { ...e, x, y, w: e.x + e.w - x, h: e.y + e.h - y };
          if (d.handle === 'end') return { ...e, w: x - e.x, h: y - e.y };
          const b = elementBox(e);
          return { ...e, x: b.x, y: b.y, w: Math.max(8, x - b.x), h: Math.max(8, y - b.y) };
        }),
      );
    }
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    const from = before.current ?? elements;
    before.current = null;
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'move' && !d.moved) return;
    let next = latest.current;
    if (d.kind === 'draw') {
      // Clique sem arrastar: forma de tamanho padrão.
      next = next.map((e) => {
        if (e.id !== d.id || Math.hypot(e.w, e.h) >= 6) return e;
        return e.type === 'arrow' || e.type === 'line'
          ? { ...e, w: 120, h: 0 }
          : { ...e, w: 140, h: 90 };
      });
      setSelected(d.id);
      setTool('select');
    }
    commit(next, from);
  }

  function onWheel(ev: ReactWheelEvent<SVGSVGElement>) {
    if (ev.ctrlKey || ev.metaKey) {
      const rect = svg.current!.getBoundingClientRect();
      zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX - rect.left, ev.clientY - rect.top);
    } else {
      setView((v) => ({ ...v, x: v.x + ev.deltaX / v.zoom, y: v.y + ev.deltaY / v.zoom }));
    }
  }

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (document.querySelector('.sheet')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === 'Escape') {
        setSelected(null);
      } else if (!mod) {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Antes de sair com algo pendente, tenta salvar.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === 'dirty' || save === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  async function addImage(file: File) {
    setError(null);
    try {
      const res = await uploadFile<{ id: string }>(`/panel/boards/${board.id}/files`, file);
      const size = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 240 });
        img.onerror = () => resolve({ w: 320, h: 240 });
        img.src = URL.createObjectURL(file);
      });
      const scale = Math.min(1, 360 / Math.max(size.w, size.h));
      const rect = svg.current?.getBoundingClientRect();
      const cx = view.x + (rect ? rect.width / 2 / view.zoom : 200);
      const cy = view.y + (rect ? rect.height / 2 / view.zoom : 150);
      const w = Math.round(size.w * scale);
      const h = Math.round(size.h * scale);
      const el: BoardElement = {
        id: newId(),
        type: 'image',
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        color: BOARD_COLORS[0],
        fileId: res.id,
      };
      commit([...elements, el]);
      setSelected(el.id);
      setTool('select');
    } catch (e) {
      setError(errorText(e, 'Não foi possível colocar a imagem.'));
    }
  }

  async function archive() {
    if (!window.confirm(`Arquivar o quadro ${title}? Ele sai da lista, mas fica guardado.`)) return;
    try {
      await api(`/panel/boards/${board.id}/archive`, { method: 'POST' });
      go('/quadros');
    } catch (e) {
      setError(errorText(e, 'Não foi possível arquivar.'));
    }
  }

  const status: Record<SaveState, string> = {
    saved: 'Salvo',
    dirty: 'Salvando…',
    saving: 'Salvando…',
    error: 'Não salvou',
    conflict: 'Outra pessoa mudou',
  };

  const selBox = selectedEl ? elementBox(selectedEl) : null;
  const pad = 6 / view.zoom;
  const showStyle = tool !== 'select' && tool !== 'hand' ? tool : selectedEl?.type;

  return (
    <div className="board">
      <div className="board__head">
        <button
          type="button"
          className="icon-button icon-button--plain"
          aria-label="Voltar para os quadros"
          onClick={() => {
            if (save === 'dirty') void persist();
            go('/quadros');
          }}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h1 className="board__title">{title}</h1>
        <button
          type="button"
          className="icon-button icon-button--plain"
          aria-label="Renomear quadro"
          onClick={() => setRenaming(true)}
        >
          <Pencil aria-hidden="true" size={16} />
        </button>
        <span
          className={`board__status${save === 'error' || save === 'conflict' ? ' board__status--bad' : ''}`}
          role="status"
        >
          {status[save]}
        </span>
        {board.canArchive && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void archive()}
          >
            <Archive aria-hidden="true" size={16} /> Arquivar
          </button>
        )}
      </div>
      {save === 'conflict' && (
        <Banner>
          Outra pessoa mudou este quadro enquanto você desenhava.{' '}
          <button type="button" className="link" onClick={() => void reloadLatest()}>
            Abrir a versão nova
          </button>{' '}
          (o que você fez desde a última vez que salvou se perde).
        </Banner>
      )}
      {error && <Banner>{error}</Banner>}
      <div className="board__tools" role="toolbar" aria-label="Ferramentas do quadro">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tool === t.id ? 'board__tool on' : 'board__tool'}
            aria-label={t.label}
            title={`${t.label} (${t.key.toUpperCase()})`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            <t.Icon aria-hidden="true" size={18} />
          </button>
        ))}
        <button
          type="button"
          className="board__tool"
          aria-label="Imagem"
          title="Imagem"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus aria-hidden="true" size={18} />
        </button>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Escolher imagem"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void addImage(f);
          }}
        />
        <span className="board__sep" aria-hidden="true" />
        <button
          type="button"
          className="board__tool"
          aria-label="Desfazer"
          title="Desfazer (Ctrl+Z)"
          disabled={hist.undo === 0}
          onClick={undo}
        >
          <Undo2 aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="board__tool"
          aria-label="Refazer"
          title="Refazer (Ctrl+Shift+Z)"
          disabled={hist.redo === 0}
          onClick={redo}
        >
          <Redo2 aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="board__tool"
          aria-label="Apagar item selecionado"
          title="Apagar (Delete)"
          disabled={!selected}
          onClick={removeSelected}
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
        <span className="board__sep" aria-hidden="true" />
        <button
          type="button"
          className="board__tool"
          aria-label="Diminuir zoom"
          onClick={() => zoomAt(1 / 1.2)}
        >
          <ZoomOut aria-hidden="true" size={18} />
        </button>
        <span className="board__zoom">{Math.round(view.zoom * 100)}%</span>
        <button
          type="button"
          className="board__tool"
          aria-label="Aumentar zoom"
          onClick={() => zoomAt(1.2)}
        >
          <ZoomIn aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="board__tool"
          aria-label="Mostrar o quadro inteiro"
          title="Mostrar o quadro inteiro"
          onClick={fit}
        >
          <Maximize aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="board__style" role="group" aria-label="Estilo">
        <div className="board__colors" role="radiogroup" aria-label="Cor">
          {BOARD_COLORS.map((c) => {
            const on = (selectedEl && tool === 'select' ? selectedEl.color : color) === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={COLOR_NAME[c]}
                className={on ? 'board__color on' : 'board__color'}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  if (selectedEl && tool === 'select') patchSelected({ color: c });
                }}
              />
            );
          })}
        </div>
        {showStyle && showStyle !== 'text' && showStyle !== 'image' && (
          <div className="board__widths" role="radiogroup" aria-label="Espessura">
            {BOARD_WIDTHS.map((w) => {
              const current =
                selectedEl && tool === 'select' && 'width' in selectedEl ? selectedEl.width : width;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={current === w}
                  aria-label={w === 2 ? 'Fina' : w === 4 ? 'Média' : 'Grossa'}
                  className={current === w ? 'board__tool on' : 'board__tool'}
                  onClick={() => {
                    setWidth(w);
                    if (selectedEl && tool === 'select' && 'width' in selectedEl) {
                      patchSelected({ width: w } as Partial<BoardElement>);
                    }
                  }}
                >
                  <Minus aria-hidden="true" size={18} strokeWidth={w / 1.2 + 0.5} />
                </button>
              );
            })}
          </div>
        )}
        {(showStyle === 'rect' || showStyle === 'ellipse') && (
          <label className="check board__fill">
            <input
              type="checkbox"
              checked={
                selectedEl && tool === 'select' && 'fill' in selectedEl ? selectedEl.fill : fill
              }
              onChange={(e) => {
                setFill(e.target.checked);
                if (selectedEl && tool === 'select' && 'fill' in selectedEl) {
                  patchSelected({ fill: e.target.checked } as Partial<BoardElement>);
                }
              }}
            />
            Preencher
          </label>
        )}
        {showStyle === 'text' && (
          <div className="board__widths" role="radiogroup" aria-label="Tamanho do texto">
            {TEXT_SIZES.map((s) => {
              const current =
                selectedEl?.type === 'text' && tool === 'select' ? selectedEl.size : textSize;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={current === s}
                  aria-label={
                    s === 16 ? 'Texto pequeno' : s === 24 ? 'Texto médio' : 'Texto grande'
                  }
                  className={current === s ? 'board__tool on' : 'board__tool'}
                  onClick={() => {
                    setTextSize(s);
                    if (selectedEl?.type === 'text' && tool === 'select') {
                      patchSelected({ size: s, ...textBox(selectedEl.text, s) });
                    }
                  }}
                >
                  <span style={{ fontSize: s === 16 ? 12 : s === 24 ? 16 : 20 }}>A</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selectedEl?.type === 'text' && (
        <label className="board__text">
          Texto
          <textarea
            ref={textInput}
            rows={2}
            maxLength={2000}
            value={selectedEl.text}
            placeholder="Escreva aqui"
            onFocus={() => {
              before.current = elements;
            }}
            onChange={(e) => {
              const text = e.target.value;
              setElements((list) =>
                list.map((el) =>
                  el.id === selectedEl.id && el.type === 'text'
                    ? { ...el, text, ...textBox(text, el.size) }
                    : el,
                ),
              );
            }}
            onBlur={() => {
              const from = before.current;
              before.current = null;
              if (from && from !== latest.current) {
                // Texto vazio não fica no quadro.
                const next = latest.current.filter(
                  (el) => !(el.type === 'text' && el.id === selectedEl.id && !el.text.trim()),
                );
                commit(next, from);
              }
            }}
          />
        </label>
      )}
      <div className="board__stage">
        <svg
          ref={svg}
          className={`board__svg board__svg--${tool}`}
          role="img"
          aria-label={`Quadro ${title}: ${elements.length === 1 ? '1 item' : `${elements.length} itens`}`}
          viewBox={`${view.x} ${view.y} ${size.w / view.zoom} ${size.h / view.zoom}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={onWheel}
          onDoubleClick={(ev) => {
            const [x, y] = point(ev);
            const hit = topAt(elements, x, y, 6 / view.zoom);
            if (hit?.type === 'text') {
              setSelected(hit.id);
              requestAnimationFrame(() => textInput.current?.focus());
            }
          }}
        >
          <defs>
            <pattern id="board-dots" width={24} height={24} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} className="board__dot" />
            </pattern>
          </defs>
          <rect
            x={view.x - 10000}
            y={view.y - 10000}
            width={20000 + 4000 / view.zoom}
            height={20000 + 4000 / view.zoom}
            fill="url(#board-dots)"
          />
          {elements.map((el) => (
            <Shape key={el.id} el={el} />
          ))}
          {selectedEl && selBox && (
            <g className="board__selection" pointerEvents="none">
              {selectedEl.type === 'arrow' || selectedEl.type === 'line' ? (
                <>
                  <circle cx={selectedEl.x} cy={selectedEl.y} r={6 / view.zoom} />
                  <circle
                    cx={selectedEl.x + selectedEl.w}
                    cy={selectedEl.y + selectedEl.h}
                    r={6 / view.zoom}
                  />
                </>
              ) : (
                <>
                  <rect
                    x={selBox.x - pad}
                    y={selBox.y - pad}
                    width={selBox.w + pad * 2}
                    height={selBox.h + pad * 2}
                    strokeWidth={1.5 / view.zoom}
                    strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
                    fill="none"
                  />
                  {selectedEl.type !== 'pen' && selectedEl.type !== 'text' && (
                    <circle cx={selBox.x + selBox.w} cy={selBox.y + selBox.h} r={6 / view.zoom} />
                  )}
                </>
              )}
            </g>
          )}
        </svg>
        {elements.length === 0 && (
          <p className="board__hint muted small">
            Escolha uma ferramenta acima e desenhe. Arraste o fundo para mover o quadro.
          </p>
        )}
      </div>
      {renaming && (
        <Rename
          title={title}
          onClose={() => setRenaming(false)}
          onSave={async (next) => {
            await api(`/panel/boards/${board.id}/title`, { method: 'PUT', body: { title: next } });
            setTitle(next);
            setRenaming(false);
          }}
        />
      )}
    </div>
  );
}

function Rename({
  title,
  onClose,
  onSave,
}: {
  title: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Renomear quadro" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value.trim()).catch((err: unknown) =>
            setError(errorText(err, 'Não foi possível renomear.')),
          );
        }}
      >
        <label>
          Nome do quadro
          <input value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button" disabled={value.trim().length < 2}>
          Salvar nome
        </button>
      </form>
    </Sheet>
  );
}
