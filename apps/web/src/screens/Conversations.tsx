import { Archive, ArchiveRestore, ArrowLeft, Bot, MessagesSquare, UserRound } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, dateTime, phone } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Message } from '../lib/types';
import { Chat, Reply } from './ContactFile';

type Tab = 'open' | 'waiting' | 'new' | 'archived';

const TABS: { id: Tab; label: string; empty: string }[] = [
  {
    id: 'open',
    label: 'Abertas',
    empty: 'Nenhuma conversa por aqui. Quando alguém chamar no WhatsApp, aparece nesta lista.',
  },
  {
    id: 'waiting',
    label: 'Esperando você',
    empty: 'Ninguém esperando. Quando uma cliente pedir para falar com você, aparece aqui.',
  },
  {
    id: 'new',
    label: 'Novas',
    empty: 'Nenhuma cliente nova nos últimos 7 dias.',
  },
  { id: 'archived', label: 'Arquivadas', empty: 'Nenhuma conversa arquivada.' },
];

interface ConversationRow {
  id: string;
  channel: string;
  botPausedAt: string | null;
  archivedAt: string | null;
  lastMessageAt: string | null;
  contact: { id: string; name: string | null; phone: string };
  lastMessage: { body: string | null; direction: Message['direction']; createdAt: string } | null;
}

interface ConversationOne {
  id: string;
  channel: string;
  botPausedAt: string | null;
  archivedAt: string | null;
  timeZone: string;
  contact: { id: string; name: string | null; phone: string; optedOutAt: string | null };
  messages: Message[];
}

/**
 * Conversas: quem chamou no WhatsApp à esquerda, a conversa aberta à direita. No celular, uma
 * coisa de cada vez. Responder pausa o robô; "Devolver para o robô" volta.
 */
export function Conversations({ id, go }: { id: string | null; go: (to: string) => void }) {
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const query = `?tab=${tab}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`;
  const list = useLoad(
    () =>
      api<{ timeZone: string; conversations: ConversationRow[] }>(`/panel/conversations${query}`),
    `conversas${query}`,
  );
  useRealtime(() => void list.reload());

  const current = TABS.find((t) => t.id === tab)!;
  const rows = list.data?.conversations ?? [];

  return (
    <>
      <PageHeader
        Icon={MessagesSquare}
        title="Conversas"
        subtitle="Quem chamou no WhatsApp. O robô responde sozinho; você assume quando quiser."
      />
      <div className={id ? 'inbox inbox--open' : 'inbox'}>
        <section className="inbox__list card" aria-label="Lista de conversas">
          <label className="search inbox__search">
            <span className="sr-only">Buscar conversa</span>
            <input
              type="search"
              placeholder="Buscar por nome ou telefone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="inbox__tabs" role="group" aria-label="Filtrar conversas">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                className={tab === t.id ? 'on' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {list.loading && !list.data ? (
            <Loading />
          ) : list.error && !list.data ? (
            <Banner>{list.error}</Banner>
          ) : rows.length === 0 ? (
            <p className="muted inbox__empty">
              {q.trim() ? 'Ninguém com esse nome ou telefone.' : current.empty}
            </p>
          ) : (
            <ul className="inbox__rows">
              {rows.map((c) => {
                const name = contactName(c.contact);
                return (
                  <li key={c.id}>
                    <a
                      href={`#/conversas/${c.id}`}
                      className={c.id === id ? 'inbox__row on' : 'inbox__row'}
                      aria-current={c.id === id ? 'true' : undefined}
                    >
                      <span className="activity__avatar" aria-hidden="true">
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="inbox__row-body">
                        <span className="inbox__row-top">
                          <strong>{name}</strong>
                          {c.lastMessage && list.data && (
                            <time className="muted small" dateTime={c.lastMessage.createdAt}>
                              {dateTime(c.lastMessage.createdAt, list.data.timeZone)}
                            </time>
                          )}
                        </span>
                        <span className="muted small inbox__preview">
                          {c.lastMessage
                            ? `${c.lastMessage.direction === 'OUTBOUND' ? 'Você ou o robô: ' : ''}${
                                c.lastMessage.body ?? 'Mensagem sem texto'
                              }`
                            : 'Sem mensagens'}
                        </span>
                        {c.botPausedAt && (
                          <span className="tag tag--attention">Esperando você</span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="inbox__chat card" aria-label="Conversa aberta">
          {id ? (
            <Open key={id} id={id} go={go} onChange={() => void list.reload()} />
          ) : (
            <p className="muted inbox__pick">Escolha uma conversa à esquerda.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Open({
  id,
  go,
  onChange,
}: {
  id: string;
  go: (to: string) => void;
  onChange: () => void;
}) {
  const { data, error, loading, reload } = useLoad(
    () => api<ConversationOne>(`/panel/conversations/${id}`),
    `conversa-${id}`,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useRealtime(() => void reload());

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
      onChange();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const name = contactName(data.contact);

  return (
    <div className="inbox__open">
      <div className="inbox__head">
        <button
          type="button"
          className="icon-button inbox__back"
          aria-label="Voltar para a lista"
          onClick={() => go('/conversas')}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div className="inbox__who">
          <h2>{name}</h2>
          <span className="muted small">{phone(data.contact.phone)}</span>
        </div>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => go(`/clientes/${data.contact.id}`)}
        >
          <UserRound aria-hidden="true" size={16} /> Ficha
        </button>
        <button
          type="button"
          className="button button--ghost button--small"
          disabled={busy}
          onClick={() =>
            act(() =>
              api(`/panel/conversations/${id}/archive`, {
                method: 'POST',
                body: { archived: !data.archivedAt },
              }),
            )
          }
        >
          {data.archivedAt ? (
            <>
              <ArchiveRestore aria-hidden="true" size={16} /> Tirar do arquivo
            </>
          ) : (
            <>
              <Archive aria-hidden="true" size={16} /> Arquivar
            </>
          )}
        </button>
      </div>
      <div className="row row--between inbox__bot">
        {data.botPausedAt ? (
          <>
            <span className="tag tag--attention">Você está atendendo</span>
            <button
              type="button"
              className="button button--small button--ghost"
              disabled={busy}
              onClick={() =>
                act(() => api(`/panel/conversations/${id}/resume`, { method: 'POST' }))
              }
            >
              <Bot aria-hidden="true" size={16} /> Devolver para o robô
            </button>
          </>
        ) : (
          <span className="tag">Robô atendendo</span>
        )}
      </div>
      {actionError && <Banner>{actionError}</Banner>}
      {data.messages.length === 0 ? (
        <Empty title="Sem mensagens" icon={<MessagesSquare size={24} />}>
          As mensagens desta cliente aparecem aqui.
        </Empty>
      ) : (
        <Chat messages={data.messages} timeZone={data.timeZone} />
      )}
      {data.contact.optedOutAt ? (
        <p className="muted small">Esta cliente pediu para não receber mensagens.</p>
      ) : (
        <Reply
          conversationId={id}
          onSent={() => {
            void reload();
            onChange();
          }}
        />
      )}
    </div>
  );
}
