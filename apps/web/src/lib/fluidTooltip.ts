/**
 * Dica fluida: um balão só para o painel inteiro, que desliza de um botão para o outro numa mola,
 * ajusta a largura ao novo texto e troca o texto rolando na direção do movimento.
 *
 * Ideia do efeito: post do Anthony Lorenzo no X, explorado no "fluid tooltip playground" (sem
 * licença declarada). Nada do código de lá foi copiado; esta é uma implementação própria, com as
 * cores e fontes da nexo e regras de acessibilidade do painel.
 *
 * Como usar numa tela:
 * - Botão só de ícone com `aria-label` e classe `icon-button`, `board__tool`, `board__color`,
 *   `tour__close`, `nex__button` ou `task__check`: a dica aparece sozinha, com o próprio rótulo.
 * - Qualquer outro elemento: `data-tip="Texto"`. Opcionais: `data-tip-sub` (texto mais suave ao
 *   lado, como um atalho), `data-tip-side` (`top`, `bottom`, `left`, `right`) e `data-tip-off`
 *   para desligar num botão que entraria pela classe.
 *
 * Acessibilidade: abre com o mouse (com atraso curto) e com o foco do teclado (na hora). Esc fecha.
 * Quando o texto da dica é diferente do nome do botão, ele vira `aria-describedby`, então o leitor
 * de tela também ouve. No toque não abre: o nome do botão já está escrito ou é lido.
 * Com "reduzir movimento" ligado, a dica só aparece e some, sem deslizar.
 */

export type TipSide = 'top' | 'bottom' | 'left' | 'right';

export const TIP_SELECTOR = [
  '[data-tip]',
  '.icon-button[aria-label]',
  '.board__tool[aria-label]',
  '.board__color[aria-label]',
  '.tour__close[aria-label]',
  '.nex__button[aria-label]',
  '.task__check[aria-label]',
].join(', ');

/** Ajuste da mola. Os números foram afinados olhando o painel, não vêm de outro projeto. */
export const TIP_TUNING = {
  stiffness: 300,
  damping: 26,
  /** Mola da entrada e saída, mais firme que a do deslize. */
  showStiffness: 460,
  showDamping: 40,
  /** Distância (px) que o texto rola ao trocar. */
  roll: 9,
  /** Desfoque máximo (px) do texto enquanto rola. */
  blur: 3,
  /** Espera antes da primeira dica (ms). */
  openDelay: 350,
  /** Se a próxima dica vier antes disso (ms), abre sem espera. */
  skipWindow: 450,
  /** Até essa distância (px) o balão desliza; mais longe, só reaparece no lugar novo. */
  glideMax: 360,
};

const H = 30;
const PAD = 11;
const GAP = 8;
const EDGE = 8;

class Spring {
  x: number;
  target: number;
  v = 0;
  constructor(value: number) {
    this.x = value;
    this.target = value;
  }
  set(value: number) {
    this.x = value;
    this.target = value;
    this.v = 0;
  }
  /** Um passo de integração (Euler semi-implícito), com h em segundos. */
  advance(h: number, k: number, c: number) {
    const force = -k * (this.x - this.target) - c * this.v;
    this.v += force * h;
    this.x += this.v * h;
  }
  resting(eps: number) {
    return Math.abs(this.x - this.target) < eps && Math.abs(this.v) < eps * 10;
  }
}

interface Label {
  el: HTMLSpanElement;
  p: Spring;
  leaving: boolean;
  axis: 'x' | 'y';
  text: string;
}

interface Placement {
  side: TipSide;
  x: number;
  y: number;
}

export function tipText(el: Element): { text: string; sub: string } | null {
  if (el.hasAttribute('data-tip-off')) return null;
  const text = (el.getAttribute('data-tip') ?? el.getAttribute('aria-label') ?? '').trim();
  if (!text) return null;
  return { text, sub: (el.getAttribute('data-tip-sub') ?? '').trim() };
}

function findTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>(TIP_SELECTOR);
  return el && tipText(el) ? el : null;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Liga a dica na página. Devolve a função que desliga (tira os ouvintes e o balão).
 * `root` é o elemento do balão, já no documento.
 */
export function installFluidTooltip(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const T = TIP_TUNING;
  const reduceQuery =
    typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reduced = () => Boolean(reduceQuery?.matches);

  root.setAttribute('role', 'tooltip');
  if (!root.id) root.id = 'nexo-dica';
  root.classList.add('ftip');

  const px = new Spring(0);
  const py = new Spring(0);
  const w = new Spring(0);
  const vis = new Spring(0);
  let labels: Label[] = [];
  let side: TipSide = 'top';
  let current: HTMLElement | null = null;
  let currentKey = '';
  let shown = false;
  let hiddenAt = -Infinity;
  let openTimer = 0;
  let hideTimer = 0;
  let pending: HTMLElement | null = null;
  let dismissed: HTMLElement | null = null;
  let described: HTMLElement | null = null;

  // ---------- texto ----------
  function makeLabel(text: string, sub: string): HTMLSpanElement {
    const el = doc.createElement('span');
    el.className = 'ftip__label';
    const main = doc.createElement('span');
    main.textContent = text;
    el.append(main);
    if (sub) {
      const s = doc.createElement('span');
      s.className = 'ftip__sub';
      s.textContent = sub;
      // espaço só para o leitor de tela (no flex, espaço sozinho não aparece)
      el.append(doc.createTextNode(' '), s);
    }
    root.append(el);
    return el;
  }

  function setLabel(text: string, sub: string): number {
    labels.forEach((l) => l.el.remove());
    const el = makeLabel(text, sub);
    labels = [{ el, p: new Spring(0), leaving: false, axis: 'y', text }];
    return el.offsetWidth + PAD * 2;
  }

  function rollLabel(text: string, sub: string, dir: number, axis: 'x' | 'y'): number {
    labels.forEach((l) => {
      if (!l.leaving) {
        l.leaving = true;
        l.axis = axis;
        l.p.target = -dir;
        l.el.setAttribute('aria-hidden', 'true');
      }
    });
    const el = makeLabel(text, sub);
    const p = new Spring(dir);
    p.target = 0;
    labels.push({ el, p, leaving: false, axis, text });
    return el.offsetWidth + PAD * 2;
  }

  // ---------- posição ----------
  function place(el: HTMLElement, width: number): Placement {
    const r = el.getBoundingClientRect();
    const vw = win.innerWidth || doc.documentElement.clientWidth;
    const vh = win.innerHeight || doc.documentElement.clientHeight;
    const wanted = el.getAttribute('data-tip-side') as TipSide | null;
    let s: TipSide = wanted ?? (el.closest('.sidebar') ? 'right' : 'top');
    if (s === 'top' && r.top - GAP - H < EDGE) s = 'bottom';
    else if (s === 'bottom' && r.bottom + GAP + H > vh - EDGE) s = 'top';
    else if (s === 'right' && r.right + GAP + width > vw - EDGE) s = 'left';
    else if (s === 'left' && r.left - GAP - width < EDGE) s = 'right';
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const half = width / 2;
    const clampX = (x: number) =>
      Math.min(Math.max(x, EDGE + half), Math.max(EDGE + half, vw - EDGE - half));
    if (s === 'top') return { side: s, x: clampX(cx), y: r.top - GAP };
    if (s === 'bottom') return { side: s, x: clampX(cx), y: r.bottom + GAP };
    if (s === 'right') return { side: s, x: r.right + GAP, y: cy };
    return { side: s, x: r.left - GAP, y: cy };
  }

  // ---------- leitor de tela ----------
  function describe(el: HTMLElement | null, text: string) {
    if (described && described !== el) undescribe();
    if (!el) return;
    const name = el.getAttribute('aria-label') ?? el.textContent ?? '';
    if (norm(text) === norm(name)) {
      undescribe();
      return;
    }
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (!ids.includes(root.id)) el.setAttribute('aria-describedby', [...ids, root.id].join(' '));
    described = el;
  }

  function undescribe() {
    if (!described) return;
    const ids = (described.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== root.id);
    if (ids.length) described.setAttribute('aria-describedby', ids.join(' '));
    else described.removeAttribute('aria-describedby');
    described = null;
  }

  // ---------- estados ----------
  function showOn(el: HTMLElement) {
    const info = tipText(el);
    if (!info) return;
    const key = `${info.text}\u0000${info.sub}`;
    // ainda aparecendo (mesmo saindo): desliza; já sumido: aparece direto no lugar
    const visible = vis.x > 0.05;
    const sameEl = el === current;
    if (sameEl && key === currentKey && visible) {
      vis.target = 1;
      return;
    }
    const before = { x: px.target, y: py.target, side };

    let width: number;
    const firstLabelWidth = () => setLabel(info.text, info.sub);

    if (!visible || reduced()) {
      width = firstLabelWidth();
      const p = place(el, width);
      side = p.side;
      px.set(p.x);
      py.set(p.y);
      w.set(width);
      if (!visible) vis.set(Math.min(vis.x, 0));
    } else {
      // mede o texto novo antes de decidir o lugar, para centralizar com a largura certa
      const probe = makeLabel(info.text, info.sub);
      const nextWidth = probe.offsetWidth + PAD * 2;
      probe.remove();
      const p = place(el, nextWidth);
      const dx = p.x - before.x;
      const dy = p.y - before.y;
      const glide = p.side === before.side && Math.hypot(dx, dy) <= T.glideMax;
      if (glide || sameEl) {
        const axis: 'x' | 'y' = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        const delta = axis === 'x' ? dx : dy;
        width = rollLabel(info.text, info.sub, Math.sign(delta) || 1, axis);
        px.target = p.x;
        py.target = p.y;
        w.target = width;
      } else {
        width = firstLabelWidth();
        px.set(p.x);
        py.set(p.y);
        w.set(width);
      }
      side = p.side;
    }
    root.dataset.side = side;
    current = el;
    currentKey = key;
    shown = true;
    vis.target = 1;
    describe(el, info.sub ? `${info.text} ${info.sub}` : info.text);
    kick();
  }

  function hover(el: HTMLElement, immediate: boolean) {
    win.clearTimeout(hideTimer);
    hideTimer = 0;
    if (el === dismissed) return;
    if (shown) {
      win.clearTimeout(openTimer);
      openTimer = 0;
      showOn(el);
      return;
    }
    pending = el;
    if (immediate || performance.now() - hiddenAt < T.skipWindow) {
      win.clearTimeout(openTimer);
      openTimer = 0;
      showOn(el);
      return;
    }
    if (!openTimer) {
      openTimer = win.setTimeout(() => {
        openTimer = 0;
        if (pending?.isConnected) showOn(pending);
      }, T.openDelay);
    }
  }

  function hide(now = false) {
    win.clearTimeout(openTimer);
    openTimer = 0;
    pending = null;
    if (!shown && !now) return;
    if (shown) hiddenAt = performance.now();
    shown = false;
    current = null;
    currentKey = '';
    vis.target = 0;
    if (now) vis.set(0);
    undescribe();
    kick();
  }

  function scheduleHide(ms: number) {
    win.clearTimeout(openTimer);
    openTimer = 0;
    pending = null;
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(() => {
      hideTimer = 0;
      hide();
    }, ms);
  }

  // ---------- quadro a quadro ----------
  let raf = 0;
  let last = 0;
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = win.requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (reduced()) {
      [px, py, w, vis].forEach((s) => s.set(s.target));
      labels.forEach((l) => l.p.set(l.p.target));
    } else {
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        px.advance(h, T.stiffness, T.damping);
        py.advance(h, T.stiffness, T.damping);
        w.advance(h, T.stiffness, T.damping);
        vis.advance(h, T.showStiffness, T.showDamping);
        labels.forEach((l) => l.p.advance(h, T.stiffness, T.damping));
      }
    }
    render();
    const settled =
      px.resting(0.05) &&
      py.resting(0.05) &&
      w.resting(0.05) &&
      vis.resting(0.002) &&
      labels.every((l) => !l.leaving && l.p.resting(0.002));
    if (!settled) {
      raf = win.requestAnimationFrame(frame);
      return;
    }
    [px, py, w, vis].forEach((sp) => sp.set(sp.target));
    labels.forEach((l) => l.p.set(l.p.target));
    render();
  }

  function render() {
    const v = Math.min(1, Math.max(0, vis.x));
    const width = Math.max(0, w.x);
    let left = px.x;
    let top = py.x;
    let ox = 0;
    let oy = 0;
    const lift = 5 * (1 - v);
    if (side === 'top') {
      left -= width / 2;
      top -= H;
      oy = lift;
    } else if (side === 'bottom') {
      left -= width / 2;
      oy = -lift;
    } else if (side === 'right') {
      top -= H / 2;
      ox = -lift;
    } else {
      left -= width;
      top -= H / 2;
      ox = lift;
    }
    root.style.opacity = v.toFixed(3);
    root.style.width = `${width.toFixed(2)}px`;
    root.style.transform = `translate3d(${(left + ox).toFixed(2)}px, ${(top + oy).toFixed(2)}px, 0) scale(${(0.96 + 0.04 * v).toFixed(4)})`;

    labels = labels.filter((l) => {
      if (l.leaving && (Math.abs(l.p.x) >= 0.97 || l.p.resting(0.002))) {
        l.el.remove();
        return false;
      }
      return true;
    });
    labels.forEach((l) => {
      const a = Math.abs(l.p.x);
      const d = (l.p.x * T.roll).toFixed(2);
      l.el.style.opacity = Math.max(0, 1 - a).toFixed(3);
      l.el.style.transform =
        l.axis === 'x' ? `translate3d(${d}px, 0, 0)` : `translate3d(0, ${d}px, 0)`;
      l.el.style.filter =
        T.blur > 0 && a > 0.002 ? `blur(${(Math.min(1, a) * T.blur).toFixed(2)}px)` : 'none';
    });
    if (v <= 0.001 && !shown) {
      labels.forEach((l) => l.leaving && l.el.remove());
      labels = labels.filter((l) => !l.leaving);
    }
  }

  // ---------- eventos ----------
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = findTarget(e.target);
    if (el) hover(el, false);
    else if (shown || openTimer) scheduleHide(90);
  };
  const onOut = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (!e.relatedTarget) scheduleHide(90);
    const from = findTarget(e.target);
    if (from && from === dismissed && findTarget(e.relatedTarget) !== from) dismissed = null;
  };
  const onDown = (e: PointerEvent) => {
    // no toque não há dica; um toque fecha a que estiver aberta
    if (e.pointerType !== 'mouse') hide(true);
  };
  const onFocusIn = (e: FocusEvent) => {
    const el = findTarget(e.target);
    if (!el) {
      if (shown) scheduleHide(60);
      return;
    }
    let keyboard = true;
    try {
      keyboard = el.matches(':focus-visible');
    } catch {
      // navegador antigo sem :focus-visible: trata como teclado
    }
    if (keyboard) {
      dismissed = null;
      hover(el, true);
    }
  };
  const onFocusOut = (e: FocusEvent) => {
    const from = findTarget(e.target);
    if (from && from === current && !findTarget(e.relatedTarget)) scheduleHide(60);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && shown) {
      dismissed = current;
      hide();
    }
  };
  const onClick = (e: MouseEvent) => {
    const el = findTarget(e.target);
    if (!el || el !== current) return;
    // o clique pode mudar o rótulo (Recolher/Abrir), mover o botão ou tirá-lo da tela
    win.requestAnimationFrame(() => {
      if (current !== el) return;
      if (!el.isConnected) hide(true);
      else showOn(el);
    });
  };
  const onScroll = () => {
    if (shown || vis.x > 0) hide(true);
  };

  doc.addEventListener('pointerover', onOver, true);
  doc.addEventListener('pointerout', onOut, true);
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('focusin', onFocusIn, true);
  doc.addEventListener('focusout', onFocusOut, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  win.addEventListener('resize', onScroll);
  win.addEventListener('hashchange', onScroll);
  win.addEventListener('blur', onScroll);

  render();

  return () => {
    doc.removeEventListener('pointerover', onOver, true);
    doc.removeEventListener('pointerout', onOut, true);
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('scroll', onScroll, true);
    win.removeEventListener('resize', onScroll);
    win.removeEventListener('hashchange', onScroll);
    win.removeEventListener('blur', onScroll);
    win.clearTimeout(openTimer);
    win.clearTimeout(hideTimer);
    if (raf) win.cancelAnimationFrame(raf);
    undescribe();
    labels.forEach((l) => l.el.remove());
    labels = [];
  };
}
