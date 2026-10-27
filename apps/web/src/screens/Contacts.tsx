import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, phone } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { ContactListItem } from '../lib/types';

export function Contacts({ go }: { go: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () => api<ContactListItem[]>('/panel/contacts', { query: q ? { q } : {} }),
    q,
  );
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
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Banner>{error}</Banner>
      ) : !data?.length ? (
        <Empty title={q ? 'Nenhuma cliente encontrada' : 'Nenhuma cliente ainda'}>
          {q
            ? 'Confira o nome ou o telefone.'
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
