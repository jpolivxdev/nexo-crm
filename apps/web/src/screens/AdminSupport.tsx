import { ArrowLeft, Headset, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import {
  statusLabel,
  type SupportStatus,
  type SupportTicket,
  SupportThread,
  topicLabel,
} from '../components/SupportThread';
import { Banner, Empty, Loading } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad } from '../lib/hooks';

const TZ = 'America/Sao_Paulo';

const FILTERS: { id: SupportStatus | ''; label: string }[] = [
  { id: 'OPEN', label: 'Esperando a nexo' },
  { id: 'ANSWERED', label: 'Esperando a dona' },
  { id: 'CLOSED', label: 'Resolvidos' },
  { id: '', label: 'Todos' },
];

interface AdminList {
  tickets: (SupportTicket & { tenantId: string; tenantName: string })[];
  counts: Partial<Record<SupportStatus, number>>;
}

/** Painel de suporte da nexo: os chamados de todos os negócios. Só o chamado, nunca dado de cliente. */
export function AdminSupport({ id, go }: { id: string | null; go: (to: string) => void }) {
  const [filter, setFilter] = useState<SupportStatus | ''>('OPEN');
  const { data, error, loading, reload } = useLoad(
    () => api<AdminList>(`/admin/support${filter ? `?status=${filter}` : ''}`),
    `admin-suporte-${filter}`,
  );

  if (id) return <AdminTicket id={id} go={go} onChange={() => void reload()} />;

  return (
    <>
      <PageHeader
        Icon={Headset}
        title="Suporte"
        subtitle="Chamados abertos pelos negócios. Responda por aqui; a dona vê na tela e no sino."
      />
      <div className="inbox__tabs" role="group" aria-label="Filtrar chamados">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'todos'}
            type="button"
            aria-pressed={filter === f.id}
            className={filter === f.id ? 'on' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id && data?.counts[f.id] ? ` (${data.counts[f.id]})` : ''}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Banner>{error}</Banner>
      ) : !data || data.tickets.length === 0 ? (
        <Empty title="Nenhum chamado aqui" icon={<LifeBuoy size={24} />}>
          Quando um negócio abrir um chamado, ele aparece nesta lista.
        </Empty>
      ) : (
        <ul className="list">
          {data.tickets.map((t) => (
            <li key={t.id}>
              <a href={`#/suporte/${t.id}`} className="card card--button support-row">
                <span className="support-row__main">
                  <strong>{t.subject}</strong>
                  <span className="muted small">
                    {t.tenantName} · {topicLabel(t.topic)} · {dateTime(t.updatedAt, TZ)}
                  </span>
                </span>
                <span className={t.status === 'OPEN' ? 'tag tag--attention' : 'tag'}>
                  {statusLabel(t.status, 'nexo')}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AdminTicket({
  id,
  go,
  onChange,
}: {
  id: string;
  go: (to: string) => void;
  onChange: () => void;
}) {
  const { data, error, loading, reload } = useLoad(
    () => api<SupportTicket & { tenantName: string }>(`/admin/support/${id}`),
    `admin-chamado-${id}`,
  );
  const [busy, setBusy] = useState(false);

  async function setStatus(status: SupportStatus) {
    setBusy(true);
    try {
      await api(`/admin/support/${id}/status`, { method: 'POST', body: { status } });
      await reload();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;

  return (
    <>
      <PageHeader
        Icon={Headset}
        title={data.subject}
        subtitle={`${data.tenantName} · ${topicLabel(data.topic)} · ${statusLabel(data.status, 'nexo')}`}
        actions={
          <>
            <button type="button" className="button button--ghost" onClick={() => go('/suporte')}>
              <ArrowLeft aria-hidden="true" size={16} /> Chamados
            </button>
            {data.status === 'CLOSED' ? (
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => void setStatus('OPEN')}
              >
                Reabrir
              </button>
            ) : (
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => void setStatus('CLOSED')}
              >
                Marcar como resolvido
              </button>
            )}
          </>
        }
      />
      <section className="section" aria-label="Conversa com a dona">
        <SupportThread
          ticket={data}
          timeZone={TZ}
          side="nexo"
          replyPath={`/admin/support/${id}/messages`}
          onSent={() => {
            void reload();
            onChange();
          }}
        />
      </section>
    </>
  );
}
