import { CalendarOff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import {
  addDays,
  BUSINESS_TZ_FALLBACK,
  contactName,
  dateTime,
  localDate,
  shortDate,
  time,
} from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

interface TimeOffItem {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  professional: { id: string; name: string } | null;
}

interface TimeOffList {
  timeZone: string;
  items: TimeOffItem[];
  professionals: { id: string; name: string }[];
}

interface Conflict {
  id: string;
  startsAt: string;
  service: { name: string };
  contact: { id: string; name: string | null; phone: string };
}

/** "15/01, dia todo", "15/01 a 20/01, dia todo" ou "15/01, das 09:00 às 12:00". */
export function periodLabel(item: { startsAt: string; endsAt: string }, tz: string): string {
  const startDay = localDate(new Date(item.startsAt), tz);
  const startTime = time(item.startsAt, tz);
  const endTime = time(item.endsAt, tz);
  if (startTime === '00:00' && endTime === '00:00') {
    const lastDay = addDays(localDate(new Date(item.endsAt), tz), -1);
    return lastDay === startDay
      ? `${shortDate(startDay)}, dia todo`
      : `${shortDate(startDay)} a ${shortDate(lastDay)}, dia todo`;
  }
  const endDay = localDate(new Date(item.endsAt), tz);
  return endDay === startDay
    ? `${shortDate(startDay)}, das ${startTime} às ${endTime}`
    : `${dateTime(item.startsAt, tz)} a ${dateTime(item.endsAt, tz)}`;
}

/** Folgas, férias e bloqueios. O robô e o painel deixam de oferecer esses horários. */
export function TimeOff({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<TimeOffList>('/panel/time-off'), '');
  useRealtime((n) => n.type === 'agenda.changed' && void reload());
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const tz = data?.timeZone ?? BUSINESS_TZ_FALLBACK;

  async function remove(id: string) {
    setActionError(null);
    try {
      await api(`/panel/time-off/${id}`, { method: 'DELETE' });
      setConflicts([]);
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível remover.');
    }
  }

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/agenda')}>
        ‹ Agenda
      </button>
      <header className="page-header">
        <h1>Folgas e bloqueios</h1>
        <p className="muted">
          Nesses períodos o robô não oferece horário e a agenda fica fechada para novas marcações.
        </p>
      </header>

      <NewTimeOff
        timeZone={tz}
        professionals={data?.professionals ?? []}
        onSaved={(found) => {
          setConflicts(found);
          void reload();
        }}
      />

      {conflicts.length > 0 && (
        <section className="banner banner--error" role="alert">
          <strong>
            {conflicts.length === 1
              ? 'Já existe 1 horário marcado nesse período.'
              : `Já existem ${conflicts.length} horários marcados nesse período.`}
          </strong>{' '}
          Eles continuam marcados. Remarque ou cancele pela ficha de cada cliente:
          <ul className="conflicts">
            {conflicts.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => go(`/clientes/${c.contact.id}`)}
                >
                  {contactName(c.contact)}
                </button>{' '}
                · {dateTime(c.startsAt, tz)} · {c.service.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="proximos-bloqueios">
        <h2 id="proximos-bloqueios">Próximos</h2>
        {actionError && <Banner>{actionError}</Banner>}
        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <Banner>{error}</Banner>
        ) : !data?.items.length ? (
          <Empty title="Nenhuma folga marcada" icon={<CalendarOff size={22} />}>
            Quando você marcar uma folga ou um bloqueio, ele aparece aqui.
          </Empty>
        ) : (
          <ul className="list">
            {data.items.map((item) => (
              <li key={item.id} className="card row row--between">
                <span>
                  <strong>{periodLabel(item, tz)}</strong>
                  {(item.reason || (data.professionals.length > 1 && item.professional)) && (
                    <span className="muted small">
                      <br />
                      {[data.professionals.length > 1 ? item.professional?.name : null, item.reason]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  aria-label={`Remover ${periodLabel(item, tz)}`}
                  onClick={() => void remove(item.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function NewTimeOff({
  timeZone: tz,
  professionals,
  onSaved,
}: {
  timeZone: string;
  professionals: { id: string; name: string }[];
  onSaved: (conflicts: Conflict[]) => void;
}) {
  const today = localDate(new Date(), tz);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [professionalId, setProfessionalId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ conflicts: Conflict[] }>('/panel/time-off', {
        method: 'POST',
        body: {
          startDate,
          // Com horas, o bloqueio é de um dia só.
          endDate: allDay ? endDate : startDate,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          professionalId: professionalId || null,
          reason: reason.trim() || null,
        },
      });
      setReason('');
      setSaved(true);
      onSaved(res.conflicts);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="section form card" onSubmit={submit} aria-labelledby="nova-folga">
      <h2 id="nova-folga">Marcar folga ou bloqueio</h2>
      <label className="check">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Dia todo
      </label>
      <div className="row--fields">
        <label>
          {allDay ? 'De' : 'Dia'}
          <input
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value > endDate) setEndDate(e.target.value);
            }}
          />
        </label>
        {allDay ? (
          <label>
            Até
            <input
              type="date"
              required
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              Das
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label>
              Às
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {professionals.length > 1 && (
        <label>
          Quem
          <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            <option value="">O negócio todo</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Motivo (opcional, só você vê)
        <input
          maxLength={80}
          value={reason}
          placeholder="Ex.: férias, curso, consulta"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <Banner>{error}</Banner>}
      {saved && <Banner kind="ok">Pronto, esse período ficou fechado.</Banner>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Salvando…' : 'Fechar esse período'}
      </button>
    </form>
  );
}
