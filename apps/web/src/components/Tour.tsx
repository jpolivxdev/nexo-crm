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
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
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

  const measure = useCallback(() => {
    const el = findTarget(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    });
  }, [step.target]);

  useLayoutEffect(() => {
    const el = findTarget(step.target);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    primary.current?.focus();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [step.target, measure]);

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
    let top = box.top + box.height + GAP;
    if (top + h > vh - GAP) top = Math.max(GAP, box.top - h - GAP);
    const left = Math.min(Math.max(GAP, box.left), Math.max(GAP, vw - w - GAP));
    c.style.top = `${top}px`;
    c.style.left = `${left}px`;
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
