import { CalendarX2 } from 'lucide-react';
import { useState } from 'react';
import { AppointmentCard } from '../components/AppointmentCard';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, BUSINESS_TZ_FALLBACK, localDate, localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Agenda as AgendaData, Appointment } from '../lib/types';
import { BookForm } from './BookForm';

type View = 'day' | 'week' | 'list';
const VIEWS: { id: View; label: string; days: number }[] = [
  { id: 'day', label: 'Dia', days: 1 },
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'list', label: 'Lista', days: 30 },
];

export function Agenda({ go }: { go: (to: string) => void }) {
  const [view, setView] = useState<View>('day');
  const [from, setFrom] = useState(() => localDate(new Date(), BUSINESS_TZ_FALLBACK));
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const days = VIEWS.find((v) => v.id === view)!.days;
  const { data, error, loading, reload } = useLoad(
    () => api<AgendaData>('/panel/agenda', { query: { from, days: String(days) } }),
    `${from}:${days}`,
  );
  useRealtime((n) => n.type === 'agenda.changed' && void reload());

  const tz = data?.timeZone ?? BUSINESS_TZ_FALLBACK;
  const byDay = new Map<string, Appointment[]>();
  for (const a of data?.appointments ?? []) {
    if (view === 'list' && a.status === 'CANCELLED') continue;
    const day = localDate(new Date(a.startsAt), tz);
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }
  const dayList =
    view === 'list' ? [...byDay.keys()] : Array.from({ length: days }, (_, i) => addDays(from, i));

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/panel/appointments/${id}/status`, { method: 'POST', body: { status } });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header row row--between">
        <h1>Agenda</h1>
        {!booking && (
          <button type="button" className="button" onClick={() => setBooking(true)}>
            Marcar horário
          </button>
        )}
      </header>

      {booking && (
        <BookForm
          date={from}
          timeZone={tz}
          onCancel={() => setBooking(false)}
          onDone={() => {
            setBooking(false);
            void reload();
          }}
        />
      )}

      <div className="segmented" role="group" aria-label="Visualização">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            className={view === v.id ? 'on' : ''}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <nav className="row row--between date-nav" aria-label="Navegar entre datas">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setFrom(addDays(from, -days))}
        >
          ‹ Anterior
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setFrom(localDate(new Date(), tz))}
        >
          Hoje
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setFrom(addDays(from, days))}
        >
          Próximo ›
        </button>
      </nav>

      {actionError && <Banner>{actionError}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Banner>{error}</Banner>
      ) : dayList.length === 0 ? (
        <Empty title="Nenhum horário nos próximos 30 dias" icon={<CalendarX2 size={24} />}>
          Os horários marcados pelo WhatsApp ou por você aparecem aqui.
        </Empty>
      ) : (
        dayList.map((day) => (
          <section key={day} className="section" aria-label={localDateLabel(day)}>
            <h2 className="day-title">{localDateLabel(day)}</h2>
            {(byDay.get(day) ?? []).length === 0 ? (
              <p className="muted">Sem horários.</p>
            ) : (
              byDay
                .get(day)!
                .map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    timeZone={tz}
                    busy={busy}
                    onOpenContact={(id) => go(`/clientes/${id}`)}
                    onStatus={(id, status) => void setStatus(id, status)}
                  />
                ))
            )}
          </section>
        ))
      )}
    </>
  );
}
