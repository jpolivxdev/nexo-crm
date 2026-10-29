import { Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, phone } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { ContactListItem } from '../lib/types';

type Segment = '' | 'frequent' | 'missing' | 'no_show';

/** Visões prontas. As regras ficam no servidor (SEGMENT_RULES) e aparecem no texto de cada uma. */
const SEGMENTS: { id: Segment; label: string; hint: string; empty: string }[] = [
  { id: '', label: 'Todas', hint: '', empty: '' },
  {
    id: 'frequent',
    label: 'Frequentes',
    hint: 'Vieram 3 vezes ou mais nos últimos 6 meses.',
    empty: 'Quando uma cliente vier 3 vezes em 6 meses, ela aparece aqui.',
  },
  {
    id: 'missing',
    label: 'Sumidas',
    hint: 'Já vieram, mas não aparecem há mais de 45 dias e não têm horário marcado. Bom momento para chamar.',
    empty: 'Ninguém sumido por enquanto. Quem passar 45 dias sem voltar aparece aqui.',
  },
  {
    id: 'no_show',
    label: 'Faltosas',
    hint: 'Faltaram 2 vezes ou mais nos últimos 6 meses.',
    empty: 'Nenhuma cliente com 2 faltas nos últimos 6 meses.',
  },
];

/** "Última vez há 62 dias", "5 vezes em 6 meses", "Faltou 2 vezes". */
export function segmentNote(c: ContactListItem, now = new Date()): string | null {
  if (c.stats?.doneCount) return `${c.stats.doneCount} vezes em 6 meses`;
  if (c.stats?.noShowCount) return `Faltou ${c.stats.noShowCount} vezes`;
  if (c.stats?.lastDoneAt) {
    const days = Math.floor((now.getTime() - new Date(c.stats.lastDoneAt).getTime()) / 86_400_000);
    return `Última vez há ${days} dias`;
  }
  return null;
}

export function Contacts({ go }: { go: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<Segment>('');
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () =>
      api<ContactListItem[]>('/panel/contacts', {
        query: { ...(q ? { q } : {}), ...(segment ? { segment } : {}) },
      }),
    `${q}:${segment}`,
  );
  const current = SEGMENTS.find((s) => s.id === segment)!;
  useRealtime(
    (n) => (n.type === 'contact.updated' || n.type === 'conversation.updated') && void reload(),
  );

  return (
    <>
      <header className="page-header row row--between">
        <h1>Clientes</h1>
        {!adding && (
          <button type="button" className="button" onClick={() => setAdding(true)}>
            Nova cliente
          </button>
        )}
      </header>
      {adding && (
        <NewContact
          onCancel={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            go(`/clientes/${id}`);
          }}
        />
      )}
      <label className="search">
        <span className="sr-only">Buscar cliente</span>
        <input
          type="search"
          placeholder="Buscar por nome ou telefone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="segmented" role="group" aria-label="Visões de clientes">
        {SEGMENTS.map((s) => (
          <button
            key={s.id || 'todas'}
            type="button"
            className={segment === s.id ? 'on' : ''}
            aria-pressed={segment === s.id}
            onClick={() => setSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {current.hint && <p className="muted small">{current.hint}</p>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Banner>{error}</Banner>
      ) : !data?.length ? (
        <Empty
          title={
            q
              ? 'Nenhuma cliente encontrada'
              : segment
                ? `Nenhuma cliente em "${current.label}"`
                : 'Nenhuma cliente ainda'
          }
          icon={<Users size={24} />}
        >
          {q
            ? 'Confira o nome ou o telefone.'
            : segment
              ? current.empty
              : 'Quem mandar mensagem no WhatsApp entra aqui sozinha.'}
        </Empty>
      ) : (
        <ul className="list">
          {data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="card card--button"
                onClick={() => go(`/clientes/${c.id}`)}
              >
                <strong>{contactName(c)}</strong>
                <span className="muted">{phone(c.phone)}</span>
                <span className="tag">{c.deals[0]?.stage.name ?? 'Sem etapa'}</span>
                {segmentNote(c) && <span className="tag tag--info">{segmentNote(c)}</span>}
                {c.optedOutAt && <span className="tag tag--warn">Não quer mensagens</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewContact({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const digits = tel.replace(/\D/g, '');
      const full = digits.length <= 11 ? `55${digits}` : digits;
      const created = await api<{ id: string }>('/panel/contacts', {
        method: 'POST',
        body: { name, phone: full },
      });
      onDone(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Nova cliente</h2>
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label>
        Telefone com DDD
        <input
          inputMode="tel"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="(15) 99999-0000"
          required
        />
      </label>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button">
          Salvar
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </form>
  );
}
