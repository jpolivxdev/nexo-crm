import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { STATUS_LABEL } from '../lib/format';
import type { AppointmentStatus } from '../lib/types';

export function Banner({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'ok';
  children: ReactNode;
}) {
  return (
    <p className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Estado vazio: diz o que vai aparecer ali e o próximo passo. */
export function Empty({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="empty">
      {icon && (
        <span className="empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div>
        <h3>{title}</h3>
        {children && <p>{children}</p>}
      </div>
    </section>
  );
}

/** Situação do horário: texto sempre visível (nunca só cor). */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`badge badge--${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function Loading() {
  return (
    <p className="muted loading" role="status">
      Carregando…
    </p>
  );
}

/**
 * Painel lateral (no celular, ocupa a tela). Fecha no X, no Esc ou tocando fora.
 * O foco entra no painel ao abrir, para o leitor de tela e o teclado.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      className="sheet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <header className="sheet__head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </section>
    </div>
  );
}
