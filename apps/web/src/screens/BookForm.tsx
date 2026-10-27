import { type FormEvent, useEffect, useState } from 'react';
import { Banner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, time } from '../lib/format';
import type { ContactListItem, Service } from '../lib/types';

/** Marcar horário pelo painel: cliente, serviço, dia e um dos horários livres. */
export function BookForm({
  date: initialDate,
  timeZone,
  contactId: fixedContactId,
  onDone,
  onCancel,
}: {
  date: string;
  timeZone: string;
  contactId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [query, setQuery] = useState('');
  const [contactId, setContactId] = useState(fixedContactId ?? '');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<{ startsAt: string }[] | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Service[]>('/panel/services')
      .then((list) => {
        setServices(list);
        if (list[0]) setServiceId((current) => current || list[0]!.id);
      })
      .catch(() => setError('Não foi possível carregar os serviços.'));
  }, []);

  useEffect(() => {
    if (fixedContactId) return;
    const handle = setTimeout(() => {
      api<ContactListItem[]>('/panel/contacts', { query: query ? { q: query } : {} })
        .then(setContacts)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, fixedContactId]);

  useEffect(() => {
    if (!serviceId || !date) return;
    let current = true;
    api<{ startsAt: string }[]>('/panel/slots', { query: { serviceId, date } })
      .then((list) => {
        if (!current) return;
        setSlots(list);
        setStartsAt('');
      })
      .catch(() => current && setSlots([]));
    return () => {
      current = false;
    };
  }, [serviceId, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!contactId || !serviceId || !startsAt) {
      setError('Escolha a cliente, o serviço e um horário.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/panel/appointments', {
        method: 'POST',
        body: { contactId, serviceId, startsAt },
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível marcar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="marcar-titulo">
      <h2 id="marcar-titulo">Marcar horário</h2>
      {!fixedContactId && (
        <>
          <label>
            Buscar cliente
            <input
              type="search"
              value={query}
              placeholder="Nome ou telefone"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Cliente
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
              <option value="">Escolha</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactName(c)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Serviço
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMinutes} min)
            </option>
          ))}
        </select>
      </label>
      <label>
        Dia
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <fieldset className="slots">
        <legend>Horários livres</legend>
        {slots === null ? (
          <p className="muted">Escolha o serviço e o dia.</p>
        ) : slots.length === 0 ? (
          <p className="muted">Nenhum horário livre nesse dia.</p>
        ) : (
          slots.map((s) => (
            <label key={s.startsAt} className={`slot ${startsAt === s.startsAt ? 'slot--on' : ''}`}>
              <input
                type="radio"
                name="slot"
                value={s.startsAt}
                checked={startsAt === s.startsAt}
                onChange={() => setStartsAt(s.startsAt)}
              />
              {time(s.startsAt, timeZone)}
            </label>
          ))
        )}
      </fieldset>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Marcando…' : 'Marcar'}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </form>
  );
}
