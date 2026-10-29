import { contactName, time } from '../lib/format';
import type { Appointment, AppointmentStatus } from '../lib/types';
import { StatusBadge } from './ui';

const ACTIVE: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];

export function AppointmentCard({
  appointment: a,
  timeZone,
  onStatus,
  onOpenContact,
  busy,
}: {
  appointment: Appointment;
  timeZone: string;
  onStatus?: (id: string, status: 'DONE' | 'NO_SHOW' | 'CANCELLED') => void;
  onOpenContact?: (contactId: string) => void;
  busy?: boolean;
}) {
  const name = contactName(a.contact);
  return (
    <article className="card appointment" aria-label={`${time(a.startsAt, timeZone)}, ${name}`}>
      <div className="appointment__time">
        <strong>{time(a.startsAt, timeZone)}</strong>
        <span className="muted">até {time(a.endsAt, timeZone)}</span>
      </div>
      <div className="appointment__body">
        <button type="button" className="link" onClick={() => onOpenContact?.(a.contact.id)}>
          {name}
        </button>
        <span className="muted">{a.service.name}</span>
        <StatusBadge status={a.status} />
      </div>
      {onStatus && ACTIVE.includes(a.status) && (
        <div className="appointment__actions">
          <button
            type="button"
            className="button button--small"
            disabled={busy}
            onClick={() => onStatus(a.id, 'DONE')}
          >
            Realizado
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={busy}
            onClick={() => onStatus(a.id, 'NO_SHOW')}
          >
            Faltou
          </button>
        </div>
      )}
    </article>
  );
}
