import { Archive, ArrowLeft, Hash, MessageCircle, Plus, Trash2, UserRound } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { BUSINESS_TZ_FALLBACK, dateTime } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

interface ChatRow {
  id: string;
  kind: 'channel' | 'direct';
  name: string;
  general: boolean;
  withUserId: string | null;
  createdById: string;
  unread: number;
  last: { authorName: string; body: string | null; at: string } | null;
}

interface ChatList {
  me: string;
  channels: ChatRow[];
  directs: ChatRow[];
  people: { id: string; name: string; role: string }[];
  unread: number;
}

interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string | null;
  deleted: boolean;
  mine: boolean;
  at: string;
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Dona',
  MANAGER: 'Gestão',
  CONSULTANT: 'Atendimento',
  STAFF: 'Profissional',
};

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * Chat da equipe (Premium): canais para todo mundo e conversas diretas entre duas pessoas.
 * Mesmo desenho das Conversas: lista à esquerda e conversa aberta à direita; no celular, uma
 * coisa de cada vez. Atualiza sozinho quando alguém escreve.
 */
export function TeamChat({
  id,
  go,
  canManage,
}: {
  id: string | null;
  go: (to: string) => void;
  canManage: boolean;
}) {
  const list = useLoad(() => api<ChatList>('/panel/chat'), 'chat');
  const [sheet, setSheet] = useState<'channel' | 'direct' | null>(null);
  useRealtime((n) => {
    if (n.type === 'chat.updated') void list.reload();
  });

  const data = list.data;
  const all = data ? [...data.channels, ...data.directs] : [];
  const current = all.find((c) => c.id === id) ?? null;

  return (
    <>
      <PageHeader
        Icon={MessageCircle}
        title="Chat da equipe"
        subtitle="Combine o dia com a equipe sem sair do painel. As clientes não veem nada daqui."
      />
      <div className={id ? 'inbox inbox--open' : 'inbox'}>
        <section className="inbox__list card" aria-label="Canais e conversas">
          {list.loading && !data ? (
            <Loading />
          ) : list.error && !data ? (
            <Banner>{list.error}</Banner>
          ) : data ? (
            <>
              <div className="row row--between team-chat__group">
                <h2 className="small">Canais</h2>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setSheet('channel')}
                >
                  <Plus aria-hidden="true" size={16} /> Novo canal
                </button>
              </div>
              <Rows rows={data.channels} id={id} />
              <div className="row row--between team-chat__group">
                <h2 className="small">Conversas diretas</h2>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled={data.people.length === 0}
                  onClick={() => setSheet('direct')}
                >
                  <Plus aria-hidden="true" size={16} /> Nova conversa
                </button>
              </div>
              {data.directs.length === 0 ? (
                <p className="muted small inbox__empty">
                  {data.people.length === 0
                    ? 'Quando tiver mais gente na equipe (Configurações, Equipe), dá para conversar só com uma pessoa aqui.'
                    : 'Nenhuma conversa direta ainda. Toque em "Nova conversa" para falar só com uma pessoa.'}
                </p>
              ) : (
                <Rows rows={data.directs} id={id} />
              )}
            </>
          ) : null}
        </section>
        <section className="inbox__chat card" aria-label="Conversa aberta">
          {id && data && current ? (
            <Room
              key={id}
              room={current}
              me={data.me}
              go={go}
              canArchive={
                current.kind === 'channel' &&
                !current.general &&
                (canManage || current.createdById === data.me)
              }
              onChange={() => void list.reload()}
            />
          ) : id && data ? (
            <Empty title="Conversa não encontrada" icon={<MessageCircle size={24} />}>
              Ela pode ter sido arquivada. Escolha outra na lista.
            </Empty>
          ) : (
            <p className="muted inbox__pick">Escolha um canal ou uma conversa à esquerda.</p>
          )}
        </section>
      </div>
      {sheet === 'channel' && (
        <NewChannel
          onClose={() => setSheet(null)}
          onDone={(newId) => {
            setSheet(null);
            void list.reload();
            go(`/chat/${newId}`);
          }}
        />
      )}
      {sheet === 'direct' && data && (
        <NewDirect
          people={data.people}
          onClose={() => setSheet(null)}
          onDone={(newId) => {
            setSheet(null);
            void list.reload();
            go(`/chat/${newId}`);
          }}
        />
      )}
    </>
  );
}

function Rows({ rows, id }: { rows: ChatRow[]; id: string | null }) {
  return (
    <ul className="inbox__rows">
      {rows.map((c) => (
        <li key={c.id}>
          <a
            href={`#/chat/${c.id}`}
            className={c.id === id ? 'inbox__row on' : 'inbox__row'}
            aria-current={c.id === id ? 'true' : undefined}
          >
            <span className="activity__avatar" aria-hidden="true">
              {c.kind === 'channel' ? <Hash size={18} /> : c.name.charAt(0).toUpperCase()}
            </span>
            <span className="inbox__row-body">
              <span className="inbox__row-top">
                <strong>{c.name}</strong>
                {c.unread > 0 && (
                  <span className="team-chat__unread">
                    {c.unread}
                    <span className="sr-only"> {c.unread === 1 ? 'nova' : 'novas'}</span>
                  </span>
                )}
              </span>
              <span className="muted small inbox__preview">
                {c.last
                  ? `${c.last.authorName}: ${c.last.body ?? 'mensagem apagada'}`
                  : 'Sem mensagens ainda'}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Room({
  room,
  me,
  go,
  canArchive,
  onChange,
}: {
  room: ChatRow;
  me: string;
  go: (to: string) => void;
  canArchive: boolean;
  onChange: () => void;
}) {
  const page = useLoad(
    () => api<{ more: boolean; messages: ChatMessage[] }>(`/panel/chat/${room.id}/messages`),
    `chat-${room.id}`,
  );
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useRealtime((n) => {
    if (n.type === 'chat.updated' && n.id === room.id) {
      void page.reload().then(onChange);
    }
  });

  // Ao abrir, a lista da esquerda zera o "novas" desta conversa.
  const loaded = Boolean(page.data);
  useEffect(() => {
    if (loaded) onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const messages = [...older, ...(page.data?.messages ?? [])];
  const lastId = page.data?.messages.at(-1)?.id;
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lastId]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    try {
      const res = await api<{ more: boolean; messages: ChatMessage[] }>(
        `/panel/chat/${room.id}/messages?before=${encodeURIComponent(first.at)}`,
      );
      setOlder((o) => [...res.messages, ...o]);
      setMore(res.more);
    } catch (e) {
      setError(errorText(e, 'Não foi possível carregar.'));
    }
  }

  async function remove(messageId: string) {
    setError(null);
    try {
      await api(`/panel/chat/${room.id}/messages/${messageId}`, { method: 'DELETE' });
      setOlder((o) => o.map((m) => (m.id === messageId ? { ...m, body: null, deleted: true } : m)));
      await page.reload();
      onChange();
    } catch (e) {
      setError(errorText(e, 'Não foi possível apagar.'));
    }
  }

  async function archive() {
    if (!window.confirm(`Arquivar o canal ${room.name}? As mensagens ficam guardadas.`)) return;
    try {
      await api(`/panel/chat/channels/${room.id}/archive`, { method: 'POST' });
      onChange();
      go('/chat');
    } catch (e) {
      setError(errorText(e, 'Não foi possível arquivar.'));
    }
  }

  const hasMore = more ?? page.data?.more ?? false;

  return (
    <div className="inbox__open">
      <div className="inbox__head">
        <button
          type="button"
          className="icon-button inbox__back"
          aria-label="Voltar para a lista"
          onClick={() => go('/chat')}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div className="inbox__who">
          <h2>{room.kind === 'channel' ? `# ${room.name}` : room.name}</h2>
          <span className="muted small">
            {room.kind === 'channel'
              ? room.general
                ? 'Toda a equipe'
                : 'Canal da equipe'
              : 'Só vocês duas pessoas veem'}
          </span>
        </div>
        {canArchive && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void archive()}
          >
            <Archive aria-hidden="true" size={16} /> Arquivar
          </button>
        )}
      </div>
      {error && <Banner>{error}</Banner>}
      {page.loading && !page.data ? (
        <Loading />
      ) : page.error && !page.data ? (
        <Banner>{page.error}</Banner>
      ) : messages.length === 0 ? (
        <Empty title="Nenhuma mensagem ainda" icon={<MessageCircle size={24} />}>
          {room.kind === 'channel'
            ? 'Escreva a primeira mensagem. Toda a equipe vê o que entra neste canal.'
            : `Escreva a primeira mensagem para ${room.name}.`}
        </Empty>
      ) : (
        <>
          {hasMore && (
            <button
              type="button"
              className="link team-chat__older"
              onClick={() => void loadOlder()}
            >
              Ver mensagens anteriores
            </button>
          )}
          <ol className="chat team-chat" aria-label="Mensagens" ref={listRef}>
            {messages.map((m) => (
              <li
                key={m.id}
                className={`bubble bubble--${m.authorId === me ? 'out' : 'in'}${
                  m.deleted ? ' bubble--deleted' : ''
                }`}
              >
                {m.authorId !== me && <strong className="team-chat__author">{m.authorName}</strong>}
                <span>{m.deleted ? 'Mensagem apagada' : m.body}</span>
                <small className="muted team-chat__meta">
                  {dateTime(m.at, BUSINESS_TZ_FALLBACK)}
                  {m.mine && !m.deleted && (
                    <button
                      type="button"
                      className="icon-button team-chat__delete"
                      aria-label="Apagar mensagem"
                      onClick={() => {
                        if (
                          window.confirm('Apagar esta mensagem? Fica "mensagem apagada" no lugar.')
                        )
                          void remove(m.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  )}
                </small>
              </li>
            ))}
          </ol>
        </>
      )}
      <Composer
        channelId={room.id}
        placeholder={
          room.kind === 'channel' ? `Mensagem para # ${room.name}` : `Mensagem para ${room.name}`
        }
        onSent={() => {
          void page.reload();
          onChange();
        }}
      />
    </div>
  );
}

function Composer({
  channelId,
  placeholder,
  onSent,
}: {
  channelId: string;
  placeholder: string;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/panel/chat/${channelId}/messages`, { method: 'POST', body: { body: text } });
      setText('');
      onSent();
    } catch (e) {
      setError(errorText(e, 'Não foi possível enviar.'));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form className="form reply" onSubmit={submit}>
      <label>
        <span className="sr-only">Escrever mensagem</span>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
      </label>
      {error && <Banner>{error}</Banner>}
      <button type="submit" className="button" disabled={busy || !text.trim()}>
        Enviar
      </button>
    </form>
  );
}

function NewChannel({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string }>('/panel/chat/channels', {
        method: 'POST',
        body: { name },
      });
      onDone(res.id);
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar o canal.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Novo canal" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome do canal
          <input
            value={name}
            maxLength={40}
            placeholder="Ex.: Recepção"
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <p className="muted small">Toda a equipe vê e escreve nos canais.</p>
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button" disabled={busy || name.trim().length < 2}>
          Criar canal
        </button>
      </form>
    </Sheet>
  );
}

function NewDirect({
  people,
  onClose,
  onDone,
}: {
  people: ChatList['people'];
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function open(userId: string) {
    setError(null);
    try {
      const res = await api<{ id: string }>('/panel/chat/direct', {
        method: 'POST',
        body: { userId },
      });
      onDone(res.id);
    } catch (e) {
      setError(errorText(e, 'Não foi possível abrir a conversa.'));
    }
  }

  return (
    <Sheet title="Nova conversa" onClose={onClose}>
      <p className="muted small">Só vocês duas pessoas veem a conversa direta.</p>
      {error && <Banner>{error}</Banner>}
      <ul className="inbox__rows">
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="inbox__row team-chat__person"
              onClick={() => void open(p.id)}
            >
              <span className="activity__avatar" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <span className="inbox__row-body">
                <strong>{p.name}</strong>
                <span className="muted small">{ROLE_LABEL[p.role] ?? ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
