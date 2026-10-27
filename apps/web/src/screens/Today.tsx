import {
  CalendarDays,
  CalendarX2,
  CircleCheck,
  History,
  ListTodo,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { AppointmentCard } from '../components/AppointmentCard';
import { TrendChart } from '../components/TrendChart';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { activityText, contactName, dateTime, localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { ActivityItem, Report, Today as TodayData } from '../lib/types';

export function Today({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<TodayData>('/panel/today'), 'today');
  // O gráfico vem do relatório de 30 dias. Se falhar, o resto do dia continua aparecendo.
  const trend = useLoad(() => api<Report>('/panel/report?days=30'), 'today-trend');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useRealtime((n) => {
    void reload();
    if (n.type === 'agenda.changed') void trend.reload();
  });

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
      await trend.reload();
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
  const active = data.appointments.filter((a) => a.status !== 'CANCELLED');
  const done = data.appointments.filter((a) => a.status === 'DONE').length;

  return (
    <>
      <header className="page-header">
        <h1>Seu dia de hoje</h1>
        <p className="muted">{localDateLabel(data.date)}</p>
      </header>
      <dl className="kpis" aria-label="Resumo do dia">
        <Kpi label="Horários" value={active.length} Icon={CalendarDays} />
        <Kpi
          label="Esperando você"
          value={data.handoffs.length}
          Icon={MessageCircle}
          attention={data.handoffs.length > 0}
        />
        <Kpi label="A fazer" value={data.tasks.length} Icon={ListTodo} />
        <Kpi label="Realizados" value={done} Icon={CircleCheck} />
      </dl>
      {actionError && <Banner>{actionError}</Banner>}

      {trend.data && trend.data.daily.length > 0 && (
        <section className="card section trend-card" aria-labelledby="ultimos-dias">
          <h2 id="ultimos-dias">Últimos 30 dias</h2>
          <TrendChart data={trend.data.daily} title="Horários marcados e realizados por dia" />
        </section>
      )}

      <div className="dash">
        <div className="dash__main">
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
                          api(`/panel/conversations/${h.conversationId}/resume`, {
                            method: 'POST',
                          }),
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
              <Empty title="Nenhum horário hoje" icon={<CalendarX2 size={24} />}>
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
                      api(`/panel/appointments/${id}/status`, {
                        method: 'POST',
                        body: { status },
                      }),
                    )
                  }
                />
              ))
            )}
          </section>
        </div>

        <div className="dash__side">
          <section aria-labelledby="afazer" className="section">
            <h2 id="afazer">A fazer</h2>
            {data.tasks.length === 0 ? (
              <Empty title="Nada pendente" icon={<ListTodo size={24} />}>
                Quando uma cliente pedir para falar com você, o lembrete aparece aqui.
              </Empty>
            ) : (
              <ul className="list">
                {data.tasks.map((t) => (
                  <li key={t.id} className="card row row--between">
                    <span>{t.title}</span>
                    <button
                      type="button"
                      className="button button--small button--ghost"
                      disabled={busy}
                      onClick={() =>
                        act(() => api(`/panel/tasks/${t.id}/done`, { method: 'POST' }))
                      }
                    >
                      Feito
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="aconteceu" className="section">
            <h2 id="aconteceu">O que aconteceu</h2>
            {data.activity.length === 0 ? (
              <Empty title="Nada por aqui ainda" icon={<History size={24} />}>
                Cada horário marcado, remarcado ou cancelado pelo WhatsApp aparece aqui.
              </Empty>
            ) : (
              <ol className="activity card">
                {data.activity.map((item) => (
                  <Activity key={item.id} item={item} timeZone={tz} go={go} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  Icon,
  attention = false,
}: {
  label: string;
  value: number;
  Icon: LucideIcon;
  attention?: boolean;
}) {
  return (
    <div className={attention ? 'kpi kpi--attention' : 'kpi'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span className="kpi__icon" aria-hidden="true">
        <Icon size={20} />
      </span>
    </div>
  );
}

function Activity({
  item,
  timeZone,
  go,
}: {
  item: ActivityItem;
  timeZone: string;
  go: (to: string) => void;
}) {
  const name = item.contact ? contactName(item.contact) : 'Uma cliente';
  return (
    <li className="activity__item">
      <span className="activity__avatar" aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="activity__body">
        <span>
          {item.contact ? (
            <button
              type="button"
              className="link activity__name"
              onClick={() => go(`/clientes/${item.contact!.id}`)}
            >
              {name}
            </button>
          ) : (
            <strong>{name}</strong>
          )}{' '}
          <span className="muted">{activityText(item.type, item.actorType)}</span>
        </span>
        <time className="muted small" dateTime={item.createdAt}>
          {dateTime(item.createdAt, timeZone)}
        </time>
      </span>
    </li>
  );
}
