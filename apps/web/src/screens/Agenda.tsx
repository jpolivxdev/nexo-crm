import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { AppointmentCard } from '../components/AppointmentCard';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, BUSINESS_TZ_FALLBACK, localDate, localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Agenda as AgendaData, Appointment } from '../lib/types';
import { BookForm } from './BookForm';

type View = 'month' | 'week' | 'list';
const VIEWS: { id: View; label: string; days: number }[] = [
  { id: 'month', label: 'Mês', days: 42 },
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'list', label: 'Lista', days: 30 },
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** "2026-10-01" → "outubro de 2026". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T12:00:00Z`));
}

/** Primeiro dia da grade do mês (o domingo da semana do dia 1). */
export function gridStart(month: string): string {
  return addDays(month, -weekday(month));
}

function shiftMonth(month: string, delta: number): string {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta, 1);
  return d.toISOString().slice(0, 10);
}

export function Agenda({ go, staff = false }: { go: (to: string) => void; staff?: boolean }) {
  const [view, setView] = useState<View>('month');
  const [from, setFrom] = useState(() => localDate(new Date(), BUSINESS_TZ_FALLBACK));
  const [selected, setSelected] = useState(from);
  const [month, setMonth] = useState(() => monthOf(from));
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const days = VIEWS.find((v) => v.id === view)!.days;
  const start = view === 'month' ? gridStart(month) : from;
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
    view === 'list' ? [...byDay.keys()] : Array.from({ length: days }, (_, i) => addDays(start, i));
  const today = localDate(new Date(), tz);
  const active = (day: string) => (byDay.get(day) ?? []).filter((a) => a.status !== 'CANCELLED');

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
          date={view === 'month' ? selected : from}
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

      {view !== 'month' && (
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
      )}

      {actionError && <Banner>{actionError}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Banner>{error}</Banner>
      ) : view === 'month' ? (
        <div className="month">
          <section className="card month__calendar" aria-labelledby="mes-titulo">
            <div className="month__head">
              <h2 id="mes-titulo">{monthLabel(month)}</h2>
              <div className="row month__nav">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Mês anterior"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </button>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => {
                    setMonth(monthOf(today));
                    setSelected(today);
                  }}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Próximo mês"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              </div>
            </div>
            <div className="month__grid" role="grid" aria-labelledby="mes-titulo">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="month__weekday" aria-hidden="true">
                  {d}
                </span>
              ))}
              {dayList.map((day) => {
                const count = active(day).length;
                const classes = [
                  'month__day',
                  day.slice(0, 7) !== month.slice(0, 7) ? 'month__day--out' : '',
                  count > 0 ? 'month__day--busy' : '',
                  day === today ? 'month__day--today' : '',
                  day === selected ? 'month__day--selected' : '',
                ].join(' ');
                return (
                  <button
                    key={day}
                    type="button"
                    className={classes}
                    aria-pressed={day === selected}
                    aria-label={`${WEEKDAYS_LONG[weekday(day)]}, ${Number(day.slice(8))}: ${
                      count === 0 ? 'sem horários' : count === 1 ? '1 horário' : `${count} horários`
                    }`}
                    onClick={() => {
                      setSelected(day);
                      if (monthOf(day) !== month) setMonth(monthOf(day));
                    }}
                  >
                    <span>{Number(day.slice(8))}</span>
                    {count > 0 && <span className="month__count">{count}</span>}
                  </button>
                );
              })}
            </div>
            <p className="muted small month__legend">
              <span className="month__swatch" aria-hidden="true" /> Dia com horário marcado
            </p>
          </section>

          <section className="month__day-panel" aria-label={localDateLabel(selected)}>
            <h2 className="day-title">{localDateLabel(selected)}</h2>
            {(byDay.get(selected) ?? []).length === 0 ? (
              <Empty title="Nenhum horário neste dia" icon={<CalendarX2 size={24} />}>
                Escolha outro dia no calendário ou marque um horário.
              </Empty>
            ) : (
              byDay
                .get(selected)!
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
        </div>
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
