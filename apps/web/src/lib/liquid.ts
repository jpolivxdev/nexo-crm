/**
 * Botões de gota: em cada grupo de opções do painel (barra de baixo do celular, menu lateral e
 * abas como Mês/Dia/Semana/Lista), o destaque da opção escolhida é uma gota que escorre até a
 * nova opção: a ponta da frente vai na hora, a de trás vem atrasada, a gota se estica e depois
 * volta ao tamanho. Ao tocar, uma onda sai do ponto do toque; o ícone da opção nova faz uma
 * animação curta.
 *
 * Ideia do "liquid glass navbar" (Waterline, guglielmogiannattasio.it), que não declara licença.
 * Nada do código de lá foi copiado: aqui não há WebGL nem som, só uma mola própria em JS e CSS
 * (`styles/liquid.css`) com as cores da nexo. As telas não mudam: a gota se prende sozinha a
 * qualquer grupo que use as classes abaixo, e segue a opção marcada (`.on`, `aria-current` ou
 * `aria-pressed`).
 *
 * Com "reduzir movimento", a gota só muda de lugar, sem esticar, sem onda e sem animar ícone.
 */

export const LIQUID_GROUPS = ['.tabbar', '.sidebar__nav', '.segmented'] as const;
const GROUP_SELECTOR = LIQUID_GROUPS.join(', ');
const ACTIVE = ':scope .on, :scope [aria-current="page"], :scope [aria-pressed="true"]';
const RIPPLE_SELECTOR = [
  '.tabbar a',
  '.sidebar__link',
  '.segmented button',
  '.button',
  '.chip',
  '.glass-adjust',
].join(', ');

/** Animações dos ícones, em rodízio pela posição da opção. */
export const ICON_FX = ['salto', 'giro', 'aceno', 'pulo'] as const;

/** Ajuste da mola (números afinados olhando o painel). */
export const LIQUID_TUNING = {
  lead: { k: 260, c: 26 },
  tail: { k: 90, c: 15 },
  /** Atraso (ms) para a ponta de trás começar a andar: é isso que estica a gota. */
  lag: 70,
};

interface Edge {
  x: number;
  v: number;
  t: number;
}

interface Drop {
  group: HTMLElement;
  el: HTMLSpanElement;
  vertical: boolean;
  a: Edge; // início (esquerda ou topo)
  b: Edge; // fim (direita ou base)
  cross: { pos: number; size: number };
  lead: 'a' | 'b' | null;
  lagUntil: number;
  target: HTMLElement | null;
  placed: boolean;
}

function activeIn(group: HTMLElement): HTMLElement | null {
  const el = group.querySelector<HTMLElement>(ACTIVE);
  return el && el.offsetParent !== null ? el : null;
}

/** Caixa da opção relativa ao grupo (canto de dentro da borda, contando a rolagem). */
function boxIn(group: HTMLElement, el: HTMLElement) {
  const g = group.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left - g.left - group.clientLeft + group.scrollLeft,
    y: r.top - g.top - group.clientTop + group.scrollTop,
    w: r.width,
    h: r.height,
  };
}

export function installLiquid(doc: Document = document): () => void {
  const win = doc.defaultView ?? window;
  const reduceQuery =
    typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const reduced = () => Boolean(reduceQuery?.matches);
  const drops = new Map<HTMLElement, Drop>();
  let raf = 0;
  let last = 0;
  let scanQueued = false;
  let stopped = false;

  function ensure(group: HTMLElement): Drop {
    let d = drops.get(group);
    if (d && d.el.isConnected && d.el.parentElement === group) return d;
    const el = doc.createElement('span');
    el.className = 'liquid-drop';
    el.setAttribute('aria-hidden', 'true');
    group.prepend(el);
    group.classList.add('has-liquid');
    d = {
      group,
      el,
      vertical: group.matches('.sidebar__nav'),
      a: { x: 0, v: 0, t: 0 },
      b: { x: 0, v: 0, t: 0 },
      cross: { pos: 0, size: 0 },
      lead: null,
      lagUntil: 0,
      target: null,
      placed: false,
    };
    drops.set(group, d);
    return d;
  }

  function aim(d: Drop, jump: boolean) {
    const target = activeIn(d.group);
    if (!target) {
      d.el.style.opacity = '0';
      d.target = null;
      d.placed = false;
      return;
    }
    const box = boxIn(d.group, target);
    const start = d.vertical ? box.y : box.x;
    const end = start + (d.vertical ? box.h : box.w);
    d.cross = d.vertical ? { pos: box.x, size: box.w } : { pos: box.y, size: box.h };
    const changed = target !== d.target;
    d.target = target;
    if (!d.placed || jump || reduced()) {
      d.a = { x: start, v: 0, t: start };
      d.b = { x: end, v: 0, t: end };
      d.placed = true;
      d.lead = null;
      render(d);
      return;
    }
    if (changed && start !== d.a.t) {
      d.lead = start > d.a.t ? 'b' : 'a';
      d.lagUntil = win.performance.now() + LIQUID_TUNING.lag;
      d.group.classList.add('liquid-moving');
    }
    d.a.t = start;
    d.b.t = end;
    kick();
  }

  function render(d: Drop) {
    const len = Math.max(0, d.b.x - d.a.x);
    const s = d.el.style;
    s.opacity = '1';
    // espessura encolhe um pouco quando a gota estica (tensão da água)
    const stretch = d.target ? len / Math.max(1, d.b.t - d.a.t) : 1;
    const thin = Math.min(0.18, Math.max(0, (stretch - 1) * 0.12));
    const size = d.cross.size * (1 - thin);
    const pos = d.cross.pos + (d.cross.size - size) / 2;
    if (d.vertical) {
      s.transform = `translate3d(${pos}px, ${d.a.x}px, 0)`;
      s.width = `${size}px`;
      s.height = `${len}px`;
    } else {
      s.transform = `translate3d(${d.a.x}px, ${pos}px, 0)`;
      s.width = `${len}px`;
      s.height = `${size}px`;
    }
  }

  function kick() {
    if (raf) return;
    last = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    let busy = false;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    drops.forEach((d) => {
      if (!d.el.isConnected) {
        drops.delete(d.group);
        return;
      }
      for (let i = 0; i < n; i++) {
        (['a', 'b'] as const).forEach((key) => {
          const e = d[key];
          const lead = d.lead === null || d.lead === key;
          const { k, c } = lead ? LIQUID_TUNING.lead : LIQUID_TUNING.tail;
          const hold = !lead && now < d.lagUntil ? 0.06 : 1;
          e.v += (k * (e.t - e.x) - c * e.v) * h * hold;
          e.x += e.v * h;
        });
      }
      const resting = (e: Edge) => Math.abs(e.t - e.x) < 0.2 && Math.abs(e.v) < 2;
      if (resting(d.a) && resting(d.b)) {
        d.a.x = d.a.t;
        d.b.x = d.b.t;
        d.a.v = d.b.v = 0;
        d.lead = null;
        d.group.classList.remove('liquid-moving');
      } else busy = true;
      render(d);
    });
    if (busy) raf = win.requestAnimationFrame(frame);
  }

  function scan() {
    scanQueued = false;
    if (stopped) return;
    doc.querySelectorAll<HTMLElement>(GROUP_SELECTOR).forEach((g) => {
      const d = ensure(g);
      const before = d.target;
      aim(d, false);
      if (d.target && before && d.target !== before) playIcon(d.group, d.target);
    });
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    win.requestAnimationFrame(scan);
  }

  // ---------- ícone ----------
  function playIcon(group: HTMLElement, item: HTMLElement) {
    if (reduced()) return;
    const icon = item.querySelector<SVGElement>('svg');
    if (!icon) return;
    const siblings = [...group.querySelectorAll(':scope a, :scope button')];
    const fx = ICON_FX[Math.max(0, siblings.indexOf(item)) % ICON_FX.length];
    icon.classList.remove('liquid-fx', ...ICON_FX.map((f) => `liquid-fx--${f}`));
    // força o navegador a recomeçar a animação
    void icon.getBoundingClientRect();
    icon.classList.add('liquid-fx', `liquid-fx--${fx}`);
    win.setTimeout(() => icon.classList.remove('liquid-fx', `liquid-fx--${fx}`), 1100);
  }

  // ---------- onda no toque ----------
  const onDown = (e: PointerEvent) => {
    if (reduced() || e.button !== 0) return;
    if (!(e.target instanceof Element)) return;
    const host = e.target.closest<HTMLElement>(RIPPLE_SELECTOR);
    if (!host || (host as HTMLButtonElement).disabled) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const wave = doc.createElement('span');
    wave.className = 'liquid-ripple';
    wave.setAttribute('aria-hidden', 'true');
    wave.style.width = wave.style.height = `${size}px`;
    wave.style.left = `${e.clientX - r.left - size / 2}px`;
    wave.style.top = `${e.clientY - r.top - size / 2}px`;
    host.classList.add('has-ripple');
    host.append(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
    win.setTimeout(() => wave.remove(), 900);
  };

  // ---------- observadores ----------
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      if (t instanceof Element && t.classList.contains('liquid-drop')) continue;
      if (r.type === 'childList') {
        const onlyOurs = [...r.addedNodes, ...r.removedNodes].every(
          (n) =>
            n instanceof Element &&
            (n.classList.contains('liquid-drop') || n.classList.contains('liquid-ripple')),
        );
        if (onlyOurs) continue;
      }
      queueScan();
      return;
    }
  });
  mo.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-current', 'aria-pressed'],
  });
  const onResize = () => drops.forEach((d) => aim(d, true));

  // ---------- troca de tela ----------
  let swapTimer = 0;
  const onRoute = () => {
    if (reduced()) return;
    const main = doc.querySelector<HTMLElement>('.app > main');
    if (!main) return;
    main.classList.remove('tela-entra');
    void main.offsetWidth; // recomeça a animação
    main.classList.add('tela-entra');
    win.clearTimeout(swapTimer);
    swapTimer = win.setTimeout(() => main.classList.remove('tela-entra'), 450);
  };
  win.addEventListener('hashchange', onRoute);
  win.addEventListener('resize', onResize);
  doc.addEventListener('pointerdown', onDown, true);
  queueScan();

  return () => {
    stopped = true;
    mo.disconnect();
    win.removeEventListener('resize', onResize);
    win.removeEventListener('hashchange', onRoute);
    win.clearTimeout(swapTimer);
    doc.removeEventListener('pointerdown', onDown, true);
    if (raf) win.cancelAnimationFrame(raf);
    drops.forEach((d) => {
      d.el.remove();
      d.group.classList.remove('has-liquid', 'liquid-moving');
    });
    drops.clear();
  };
}
