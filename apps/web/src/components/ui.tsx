import type { ReactNode } from 'react';
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
    <p className="muted" role="status">
      Carregando…
    </p>
  );
}
