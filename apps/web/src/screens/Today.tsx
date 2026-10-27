import { useState } from 'react';
import { AppointmentCard } from '../components/AppointmentCard';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, dateTime, localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Today as TodayData } from '../lib/types';

export function Today({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<TodayData>('/panel/today'), 'today');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const tz = data.timeZone;

  return (
    <>
      <header className="page-header">
        <h1>Seu dia de hoje</h1>
        <p className="muted">{localDateLabel(data.date)}</p>
      </header>
      {actionError && <Banner>{actionError}</Banner>}

      {data.handoffs.length > 0 && (
        <section aria-labelledby="pedidos" className="section">
          <h2 id="pedidos">Clientes esperando resposta</h2>
          {data.handoffs.map((h) => (
            <article key={h.conversationId} className="card card--attention">
              <button
                type="button"
                className="link"
                onClick={() => go(`/clientes/${h.contact.id}`)}
              >
                {contactName(h.contact)}
              </button>
              <p className="muted">
                Pediu para falar com você em {dateTime(h.since, tz)}
                {h.lastMessage?.body ? `: "${h.lastMessage.body}"` : ''}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => go(`/clientes/${h.contact.id}`)}
                >
                  Responder
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api(`/panel/conversations/${h.conversationId}/resume`, { method: 'POST' }),
                    )
                  }
                >
                  Devolver para o robô
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="horarios" className="section">
        <h2 id="horarios">Horários marcados</h2>
        {data.appointments.length === 0 ? (
          <Empty title="Nenhum horário hoje">
            Quando uma cliente marcar pelo WhatsApp, o horário aparece aqui na hora.
          </Empty>
        ) : (
          data.appointments.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              timeZone={tz}
              busy={busy}
              onOpenContact={(id) => go(`/clientes/${id}`)}
              onStatus={(id, status) =>
                act(() =>
                  api(`/panel/appointments/${id}/status`, { method: 'POST', body: { status } }),
                )
              }
            />
          ))
        )}
      </section>

      <section aria-labelledby="afazer" className="section">
        <h2 id="afazer">A fazer</h2>
        {data.tasks.length === 0 ? (
          <Empty title="Nada pendente" />
        ) : (
          <ul className="list">
            {data.tasks.map((t) => (
              <li key={t.id} className="card row row--between">
                <span>{t.title}</span>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={busy}
                  onClick={() => act(() => api(`/panel/tasks/${t.id}/done`, { method: 'POST' }))}
                >
                  Feito
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
