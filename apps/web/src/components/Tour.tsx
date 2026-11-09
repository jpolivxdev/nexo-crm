import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourStep } from '../lib/tours';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP = 12;
const PAD = 6;
const TOP_ROOM = 96;

/** Primeiro elemento visível do seletor (o menu lateral some no celular, a barra de baixo no PC). */
function findTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  let list: NodeListOf<HTMLElement>;
  try {
    list = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Tour guiado: destaca uma parte da tela e explica em uma frase. Pular, Voltar e Próximo; Esc
 * fecha. É um diálogo: o foco fica dentro dele e volta para onde estava ao fechar.
 */
export function Tour({
  steps,
  onClose,
  onRoute,
}: {
  steps: TourStep[];
  onClose: () => void;
  /** Leva para a tela do passo (tour da demo). */
  onRoute?: (to: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // Devolve o foco para quem abriu o tour.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  // Mede de novo sempre que pedir: a tela pode crescer depois (dados chegando), então o destaque
  // acompanha o tamanho real e fica preso à parte visível da janela.
  const measure = useCallback(() => {
    const el = findTarget(step.target);
    // Enquanto a tela ainda carrega, o destaque espera: o tamanho e o lugar ainda vão mudar.
    if (!el || document.querySelector('main .loading')) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const top = Math.max(r.top - PAD, 4);
    const bottom = Math.min(r.bottom + PAD, vh - 4);
    const next = {
      top,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: Math.max(bottom - top, 0),
    };
    setBox((prev) =>
      prev &&
      Math.abs(prev.top - next.top) < 0.5 &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      Math.abs(prev.height - next.height) < 0.5
        ? prev
        : next,
    );
  }, [step.target]);

  // Acompanha mudanças de tamanho e de conteúdo da tela enquanto o passo está aberto.
  useEffect(() => {
    let frame = 0;
    let observed: HTMLElement | null = null;
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    const follow = () => {
      const el = findTarget(step.target);
      if (el !== observed) {
        if (observed) resize?.unobserve(observed);
        if (el) resize?.observe(el);
        observed = el;
      }
      measure();
    };
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    }
    follow();
    const mutation =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    mutation?.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [measure, step.target]);

  // Passo em outra tela: navega e espera a parte destacada aparecer (até ~2 s).
  const route = step.route;
  useEffect(() => {
    if (route && onRoute && window.location.hash.replace(/^#/, '') !== route) onRoute(route);
  }, [route, onRoute]);

  useLayoutEffect(() => {
    primary.current?.focus();
    let tries = 0;
    let handle = 0;
    const tick = () => {
      const el = findTarget(step.target);
      if (el || !step.target || tries >= 20) {
        el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        // Deixa um respiro em cima para a faixa fixa (demo) não cobrir o começo do destaque.
        const top = el?.getBoundingClientRect().top ?? TOP_ROOM;
        if (top < TOP_ROOM) window.scrollBy?.({ top: top - TOP_ROOM });
        measure();
        return;
      }
      tries += 1;
      handle = window.setTimeout(tick, 100);
    };
    const frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(handle);
    };
  }, [step.target, measure, index]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Cartão embaixo do destaque; sem espaço, em cima. No celular, fica preso embaixo (CSS).
  // A posição vai direto no estilo: depende do tamanho do cartão, que só existe depois de pintar.
  useLayoutEffect(() => {
    const c = card.current;
    if (!c) return;
    if (!box) {
      c.style.removeProperty('top');
      c.style.removeProperty('left');
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = c.offsetHeight;
    const w = c.offsetWidth;
    const fitsLeft = (x: number) => Math.min(Math.max(GAP, x), Math.max(GAP, vw - w - GAP));
    const fitsTop = (y: number) => Math.min(Math.max(GAP, y), Math.max(GAP, vh - h - GAP));
    const below = box.top + box.height + GAP;
    const above = box.top - h - GAP;
    const right = box.left + box.width + GAP;
    const left = box.left - w - GAP;
    let top: number;
    let x: number;
    if (below + h <= vh - GAP) {
      top = below;
      x = fitsLeft(box.left);
    } else if (above >= GAP) {
      top = above;
      x = fitsLeft(box.left);
    } else if (right + w <= vw - GAP) {
      // Destaque alto (lista inteira): o cartão vai ao lado, sem cobrir nada.
      top = fitsTop(box.top);
      x = right;
    } else if (left >= GAP) {
      top = fitsTop(box.top);
      x = left;
    } else {
      top = vh - h - GAP;
      x = fitsLeft(box.left);
    }
    c.style.top = `${top}px`;
    c.style.left = `${x}px`;
  }, [box, index]);

  function next() {
    if (last) onClose();
    else setIndex((i) => i + 1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !card.current) return;
    const items = card.current.querySelectorAll<HTMLElement>('button');
    if (items.length === 0) return;
    const first = items[0]!;
    const end = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      end.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first.focus();
    }
  }

  const titleId = 'tour-titulo';
  return (
    <div className="tour" onKeyDown={onKeyDown}>
      {box ? (
        <div
          className="tour__spot"
          aria-hidden="true"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      ) : (
        <div className="tour__backdrop" aria-hidden="true" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby="tour-texto"
        className={box ? 'tour__card' : 'tour__card tour__card--center'}
      >
        <div className="tour__top">
          <span className="muted small">
            Passo {index + 1} de {steps.length}
          </span>
          <button
            type="button"
            className="tour__close"
            aria-label="Fechar o tour"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <h2 id={titleId}>{step.title}</h2>
        <p id="tour-texto">{step.text}</p>
        <div className="tour__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i === index ? 'on' : ''} />
          ))}
        </div>
        <div className="tour__actions">
          <button type="button" className="link" onClick={onClose}>
            Pular tour
          </button>
          <span className="tour__nav">
            {index > 0 && (
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setIndex((i) => i - 1)}
              >
                Voltar
              </button>
            )}
            <button ref={primary} type="button" className="button button--small" onClick={next}>
              {last ? 'Concluir' : 'Próximo'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
