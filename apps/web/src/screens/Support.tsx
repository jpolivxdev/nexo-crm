import { ArrowLeft, Headset, LifeBuoy } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import {
  statusLabel,
  SUPPORT_TOPICS,
  type SupportTicket,
  SupportThread,
  topicLabel,
} from '../components/SupportThread';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

const TZ = 'America/Sao_Paulo';

/** Suporte: a dona abre um chamado para a nexo e acompanha a resposta aqui e no sino. */
export function Support({ id, go }: { id: string | null; go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(
    () => api<SupportTicket[]>('/panel/support'),
    'suporte',
  );
  const [opening, setOpening] = useState(false);
  useRealtime((n) => {
    if (n.type === 'support.updated') void reload();
  });

  if (id) return <Ticket id={id} go={go} onChange={() => void reload()} />;

  return (
    <>
      <PageHeader
        Icon={Headset}
        title="Suporte"
        subtitle="Abra um chamado e acompanhe a resposta aqui e no sino."
        actions={
          !opening && (
            <button type="button" className="button" onClick={() => setOpening(true)}>
              Abrir chamado
            </button>
          )
        }
      />
      {opening && (
        <OpenTicket
          onCancel={() => setOpening(false)}
          onDone={(newId) => {
            setOpening(false);
            void reload();
            go(`/suporte/${newId}`);
          }}
        />
      )}
      <section className="section" aria-labelledby="chamados">
        <h2 id="chamados">Seus chamados</h2>
        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <Banner>{error}</Banner>
        ) : !data || data.length === 0 ? (
          <Empty title="Nenhum chamado aberto" icon={<LifeBuoy size={24} />}>
            Deu problema ou ficou com dúvida? Abra um chamado e a equipe da nexo responde por aqui.
          </Empty>
        ) : (
          <ul className="list">
            {data.map((t) => (
              <li key={t.id}>
                <a href={`#/suporte/${t.id}`} className="card card--button support-row">
                  <span className="support-row__main">
                    <strong>{t.subject}</strong>
                    <span className="muted small">
                      {topicLabel(t.topic)} · {dateTime(t.updatedAt, TZ)}
                    </span>
                  </span>
                  <span className={t.status === 'ANSWERED' ? 'tag tag--attention' : 'tag'}>
                    {statusLabel(t.status, 'owner')}
                  </span>
                  {t.ownerUnread && <span className="sr-only">Resposta nova</span>}
                  {t.ownerUnread && <span className="support-row__dot" aria-hidden="true" />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function OpenTicket({ onCancel, onDone }: { onCancel: () => void; onDone: (id: string) => void }) {
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0]!.id);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/panel/support', {
        method: 'POST',
        body: { topic, subject, description },
      });
      onDone(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o chamado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="novo-chamado">
      <h2 id="novo-chamado">Abrir chamado</h2>
      <label>
        Assunto
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Resumo
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          required
          placeholder="Ex.: o lembrete não chegou para a cliente"
        />
      </label>
      <label>
        O que aconteceu
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          required
        />
      </label>
      <p className="muted small">
        Evite colocar dados das suas clientes (telefone, documento). Se precisar, a nexo pede.
      </p>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          Enviar chamado
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </form>
  );
}

function Ticket({
  id,
  go,
  onChange,
}: {
  id: string;
  go: (to: string) => void;
  onChange: () => void;
}) {
  const { data, error, loading, reload } = useLoad(
    () => api<SupportTicket>(`/panel/support/${id}`),
    `chamado-${id}`,
  );
  const [busy, setBusy] = useState(false);
  useRealtime((n) => {
    if (n.type === 'support.updated' && n.id === id) void reload();
  });

  async function close() {
    setBusy(true);
    try {
      await api(`/panel/support/${id}/close`, { method: 'POST' });
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
        subtitle={`${topicLabel(data.topic)} · ${statusLabel(data.status, 'owner')}`}
        actions={
          <>
            <button type="button" className="button button--ghost" onClick={() => go('/suporte')}>
              <ArrowLeft aria-hidden="true" size={16} /> Chamados
            </button>
            {data.status !== 'CLOSED' && (
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => void close()}
              >
                Marcar como resolvido
              </button>
            )}
          </>
        }
      />
      <section className="section" aria-label="Conversa com a nexo">
        <SupportThread
          ticket={data}
          timeZone={TZ}
          side="owner"
          replyPath={`/panel/support/${id}/messages`}
          onSent={() => {
            void reload();
            onChange();
          }}
        />
      </section>
    </>
  );
}
