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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
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
