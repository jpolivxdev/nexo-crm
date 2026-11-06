import { Compass, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import nexFoto from '../assets/nex.webp';

/** Atalho do guia: leva para uma tela e abre o tour dela. */
export interface NexTopic {
  label: string;
  to: string;
}

/**
 * Nex, guia de uso. Por enquanto mostra o caminho pelos tours de cada tela, sem IA. Não vê os
 * dados do negócio: só sabe onde fica cada coisa.
 */
export function Nex({
  topics,
  onTour,
}: {
  topics: NexTopic[];
  /** Abre o tour da tela (e navega até ela, se for outra). */
  onTour: (to?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function pick(to?: string) {
    setOpen(false);
    onTour(to);
  }

  return (
    <>
      {open && (
        <div ref={panel} className="nex__panel" role="dialog" aria-labelledby="nex-titulo">
          <div className="nex__head">
            <img src={nexFoto} alt="" className="nex__foto" width={40} height={40} />
            <div>
              <h2 id="nex-titulo">Nex, guia de uso</h2>
              <p className="muted small">Mostra o caminho. Não vê os dados das suas clientes.</p>
            </div>
            <button
              type="button"
              className="tour__close"
              aria-label="Fechar o guia"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p>Oi! Eu sou o Nex. Escolha um assunto e eu mostro onde fica, passo a passo.</p>
          <ul className="nex__topics">
            <li>
              <button type="button" className="nex__topic" onClick={() => pick()}>
                <Compass aria-hidden="true" size={16} /> Me mostra esta tela
              </button>
            </li>
            {topics.map((t) => (
              <li key={t.to + t.label}>
                <button type="button" className="nex__topic" onClick={() => pick(t.to)}>
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="nex__button"
        aria-label="Nex, guia de uso"
        aria-expanded={open}
        data-tour="nex"
        onClick={() => setOpen((v) => !v)}
      >
        <img src={nexFoto} alt="" width={56} height={56} />
      </button>
    </>
  );
}
