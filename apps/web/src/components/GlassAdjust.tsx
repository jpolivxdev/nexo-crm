import { Layers, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassControls } from './GlassControls';

/**
 * Botão "Ajustar vidro" da barra de cima (a partir de 640 px; no celular o ajuste fica em
 * Conta → Aparência). Abre uma janela de vidro com prévia, modelos e os controles finos.
 * Mesmo ajuste de Conta → Aparência: vale só neste aparelho. A janela vai direto no <body>:
 * dentro da barra (que tem desfoque) ela ficaria presa atrás do conteúdo.
 */
export function GlassAdjust() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="glass-adjust"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal aria-hidden="true" size={18} />
        <span>Ajustar vidro</span>
      </button>
      {open &&
        createPortal(
          <aside ref={panel} id={id} className="glass-pop" aria-label="Aparência do vidro">
            <div className="glass-pop__head">
              <h2>Aparência do vidro</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar o ajuste do vidro"
                onClick={close}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p className="muted small">Vale para todo o painel, só neste aparelho.</p>
            <div className="glass-pop__sample" aria-hidden="true">
              <Layers size={24} strokeWidth={1.4} />
              <span>Prévia do vidro</span>
            </div>
            <GlassControls compact />
          </aside>,
          document.body,
        )}
    </>
  );
}
