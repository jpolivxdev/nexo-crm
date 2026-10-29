import { CalendarX2 } from 'lucide-react';
import { useState } from 'react';
import { AppointmentCard } from '../components/AppointmentCard';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, BUSINESS_TZ_FALLBACK, localDate, localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Agenda as AgendaData, Appointment } from '../lib/types';
import { BookForm } from './BookForm';

type View = 'month' | 'day' | 'week' | 'list';
const VIEWS: { id: View; label: string; days: number }[] = [
  { id: 'month', label: 'Mês', days: 42 },
  { id: 'day', label: 'Dia', days: 1 },
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'list', label: 'Lista', days: 30 },
];

export function Agenda({ go, staff = false }: { go: (to: string) => void; staff?: boolean }) {
  const [view, setView] = useState<View>('month');
  const [from, setFrom] = useState(() => localDate(new Date(), BUSINESS_TZ_FALLBACK));
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const days = VIEWS.find((v) => v.id === view)!.days;
  // No mês, `from` é o dia escolhido e a busca começa no domingo da primeira semana do mês.
  const start = view === 'month' ? gridStart(from) : from;
  const { data, error, loading, reload } = useLoad(
    () => api<AgendaData>('/panel/agenda', { query: { from: start, days: String(days) } }),
    `${start}:${days}`,
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
    view === 'list'
      ? [...byDay.keys()]
      : view === 'month'
        ? [from]
        : Array.from({ length: days }, (_, i) => addDays(from, i));
  const step = (n: number) =>
    setFrom(view === 'month' ? addMonths(from, n) : addDays(from, n * days));

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
        <div className="row page-header__actions">
          {!staff && (
            <button type="button" className="button button--ghost" onClick={() => go('/folgas')}>
              Folgas
            </button>
          )}
          {!booking && !staff && (
            <button type="button" className="button" onClick={() => setBooking(true)}>
              Marcar horário
            </button>
          )}
        </div>
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
          onClick={() => step(-1)}
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
          onClick={() => step(1)}
        >
          Próximo ›
        </button>
      </nav>

      {actionError && <Banner>{actionError}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Banner>{error}</Banner>
      ) : (
        view === 'month' && (
          <MonthGrid
            selected={from}
            today={localDate(new Date(), tz)}
            byDay={byDay}
            onSelect={setFrom}
          />
        )
      )}
      {loading && !data ? null : error ? null : dayList.length === 0 ? (
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
                    onOpenContact={staff ? undefined : (id) => go(`/clientes/${id}`)}
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

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Domingo da semana em que cai o dia 1 do mês de `date` (AAAA-MM-DD). */
function gridStart(date: string): string {
  const first = `${date.slice(0, 8)}01`;
  return addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
}

/** Dia 1 do mês `n` meses antes ou depois de `date`. */
function addMonths(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function monthLabel(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function MonthGrid({
  selected,
  today,
  byDay,
  onSelect,
}: {
  selected: string;
  today: string;
  byDay: Map<string, Appointment[]>;
  onSelect: (day: string) => void;
}) {
  const start = gridStart(selected);
  const month = selected.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const active = (day: string) => (byDay.get(day) ?? []).filter((a) => a.status !== 'CANCELLED');
  const total = cells.filter((d) => d.startsWith(month)).reduce((n, d) => n + active(d).length, 0);

  return (
    <section className="month" aria-label={`Calendário de ${monthLabel(selected)}`}>
      <div className="month__head">
        <h2 className="day-title">{monthLabel(selected)}</h2>
        <p className="muted">
          {total === 0
            ? 'Nenhum horário no mês'
            : total === 1
              ? '1 horário no mês'
              : `${total} horários no mês`}
        </p>
      </div>
      <div className="month__grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="month__weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((day) => {
          const count = active(day).length;
          const classes = [
            'month__day',
            day.startsWith(month) ? '' : 'month__day--out',
            day === today ? 'month__day--today' : '',
            count > 0 ? 'month__day--busy' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={day}
              type="button"
              className={classes}
              aria-pressed={day === selected}
              aria-label={`${localDateLabel(day)}, ${
                count === 0 ? 'sem horários' : count === 1 ? '1 horário' : `${count} horários`
              }`}
              onClick={() => onSelect(day)}
            >
              <span className="month__num">{Number(day.slice(8))}</span>
              {count > 0 && <span className="month__count">{count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
