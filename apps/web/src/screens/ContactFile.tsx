import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Banner, Loading, StatusBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { BUSINESS_TZ_FALLBACK, contactName, dateTime, localDate, phone } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { ContactFile as ContactFileData, Message } from '../lib/types';
import { BookForm } from './BookForm';

/** Ficha da cliente: etapa, horários, conversa (responder / devolver ao robô) e anotações. */
export function ContactFile({ id, go }: { id: string; go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(
    () => api<ContactFileData>(`/panel/contacts/${id}`),
    id,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  useRealtime(() => void reload());

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const conversation = data.conversations[0];
  const tz = data.timeZone || BUSINESS_TZ_FALLBACK;

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/clientes')}>
        ‹ Clientes
      </button>
      <header className="page-header">
        <h1>{contactName(data)}</h1>
        <p className="muted">{phone(data.phone)}</p>
        {data.optedOutAt && <span className="tag tag--warn">Pediu para não receber mensagens</span>}
      </header>
      {actionError && <Banner>{actionError}</Banner>}

      {data.deal && (
        <section className="section" aria-labelledby="etapa">
          <h2 id="etapa">Etapa</h2>
          <div className="chips" role="group" aria-label="Mudar etapa">
            {data.deal.stages.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip ${s.id === data.deal!.stage.id ? 'chip--on' : ''}`}
                aria-pressed={s.id === data.deal!.stage.id}
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api(`/panel/deals/${data.deal!.id}/stage`, {
                      method: 'POST',
                      body: { stageId: s.id },
                    }),
                  )
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="horarios-cliente">
        <div className="row row--between">
          <h2 id="horarios-cliente">Horários</h2>
          {!booking && (
            <button type="button" className="button button--small" onClick={() => setBooking(true)}>
              Marcar horário
            </button>
          )}
        </div>
        {booking && (
          <BookForm
            date={localDate(new Date(), tz)}
            timeZone={tz}
            contactId={data.id}
            onCancel={() => setBooking(false)}
            onDone={() => {
              setBooking(false);
              void reload();
            }}
          />
        )}
        {data.appointments.length === 0 ? (
          <p className="muted">Nenhum horário ainda.</p>
        ) : (
          <ul className="list">
            {data.appointments.map((a) => (
              <li key={a.id} className="card row row--between">
                <span>
                  {dateTime(a.startsAt, tz)} · {a.service.name}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {conversation && (
        <section className="section" aria-labelledby="conversa">
          <div className="row row--between">
            <h2 id="conversa">Conversa</h2>
            {conversation.botPausedAt ? (
              <button
                type="button"
                className="button button--small button--ghost"
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api(`/panel/conversations/${conversation.id}/resume`, { method: 'POST' }),
                  )
                }
              >
                Devolver para o robô
              </button>
            ) : (
              <span className="tag">Robô atendendo</span>
            )}
          </div>
          <Chat messages={conversation.messages} timeZone={tz} />
          {!data.optedOutAt && (
            <Reply conversationId={conversation.id} onSent={() => void reload()} />
          )}
        </section>
      )}

      <Notes id={data.id} initial={data.notes ?? ''} onSaved={() => void reload()} />
    </>
  );
}

/** Histórico da conversa, já rolado até a mensagem mais recente. */
function Chat({ messages, timeZone: tz }: { messages: Message[]; timeZone: string }) {
  const list = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [last]);

  return (
    <ol className="chat" aria-label="Mensagens" ref={list}>
      {messages.map((m) => (
        <li key={m.id} className={`bubble bubble--${m.direction === 'INBOUND' ? 'in' : 'out'}`}>
          {/* Conteúdo da cliente é sempre texto puro. */}
          <span>{m.body ?? `[${m.type}]`}</span>
          <small className="muted">
            {dateTime(m.createdAt, tz)}
            {m.direction === 'OUTBOUND' && m.status === 'failed' ? ' · não enviada' : ''}
          </small>
        </li>
      ))}
    </ol>
  );
}

function Reply({ conversationId, onSent }: { conversationId: string; onSent: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/panel/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { text },
      });
      setText('');
      onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form reply" onSubmit={submit}>
      <label>
        Responder (o robô pausa nesta conversa)
        <textarea
          rows={2}
          maxLength={4096}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && <Banner>{error}</Banner>}
      <button type="submit" className="button" disabled={busy || !text.trim()}>
        {busy ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  );
}

function Notes({ id, initial, onSaved }: { id: string; initial: string; onSaved: () => void }) {
  const [notes, setNotes] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/panel/contacts/${id}`, { method: 'PATCH', body: { notes: notes || null } });
      setStatus('Anotação salva.');
      onSaved();
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <form className="section form" onSubmit={submit} aria-labelledby="anotacoes">
      <h2 id="anotacoes">Anotações</h2>
      <label>
        <span className="sr-only">Anotações</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="muted small">Evite anotar informação de saúde aqui.</p>
      {status && <p role="status">{status}</p>}
      <button type="submit" className="button button--ghost">
        Salvar anotação
      </button>
    </form>
  );
}
