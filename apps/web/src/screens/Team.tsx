import { UsersRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useLoad } from '../lib/hooks';
import type { SetupWindow } from '../lib/types';
import { daysToWindows, WeekHours, windowsToDays } from './Setup';

interface Professional {
  id: string;
  name: string;
  active: boolean;
  isOwner: boolean;
  serviceIds: string[];
  windows: SetupWindow[];
  login: string | null;
}

interface TeamData {
  services: { id: string; name: string }[];
  professionals: Professional[];
}

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Equipe: quem atende, o que cada uma faz, os horários e o acesso ao painel. */
export function Team({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<TeamData>('/panel/team'), '');
  const [editing, setEditing] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const current = data.professionals.find((p) => p.id === editing);

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <header className="page-header">
        <h1>Equipe</h1>
        <p className="muted">
          Com mais de uma profissional, o robô pergunta com quem a cliente prefere e só oferece os
          horários livres de cada uma.
        </p>
      </header>

      {current ? (
        <EditProfessional
          key={current.id}
          professional={current}
          services={data.services}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      ) : (
        <>
          <NewProfessional onCreated={() => void reload()} />
          {data.professionals.length === 0 ? (
            <Empty title="Ninguém na equipe ainda" icon={<UsersRound size={22} />}>
              Configure o negócio primeiro: a sua agenda aparece aqui.
            </Empty>
          ) : (
            <ul className="list">
              {data.professionals.map((p) => (
                <li key={p.id} className="card row row--between">
                  <span className="stack-tight">
                    <strong>{p.name}</strong>
                    <span className="row tags">
                      {p.isOwner && <span className="tag">Sua agenda</span>}
                      {!p.active && <span className="tag tag--warn">Desativada</span>}
                      {!p.isOwner && (
                        <span className="tag tag--info">
                          {p.login ? `Acesso: ${p.login}` : 'Sem acesso ao painel'}
                        </span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="button button--small button--ghost"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => setEditing(p.id)}
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function NewProfessional({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/panel/team', { method: 'POST', body: { name } });
      setName('');
      onCreated();
    } catch (e) {
      setError(message(e, 'Não foi possível adicionar.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form section" onSubmit={submit}>
      <h2>Adicionar profissional</h2>
      <label>
        Nome (como a cliente vai ver no WhatsApp)
        <input
          value={name}
          required
          minLength={2}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="muted small">
        Ela começa com os seus serviços e horários. Depois é só ajustar.
      </p>
      {error && <Banner>{error}</Banner>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Adicionando…' : 'Adicionar'}
      </button>
    </form>
  );
}

function EditProfessional({
  professional: p,
  services,
  onClose,
  onSaved,
}: {
  professional: Professional;
  services: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(p.name);
  const [active, setActive] = useState(p.active);
  const [serviceIds, setServiceIds] = useState(new Set(p.serviceIds));
  const [days, setDays] = useState(() => windowsToDays(p.windows));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const windows = daysToWindows(days);
    if (typeof windows === 'string') {
      setStatus({ ok: false, text: windows });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await api(`/panel/team/${p.id}`, {
        method: 'PUT',
        body: { name, active, serviceIds: [...serviceIds], windows },
      });
      setStatus({ ok: true, text: 'Salvo. O robô já usa os horários novos.' });
      onSaved();
    } catch (e) {
      setStatus({ ok: false, text: message(e, 'Não foi possível salvar.') });
    } finally {
      setBusy(false);
    }
  }

  function toggleService(id: string, on: boolean) {
    setServiceIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <>
      <button type="button" className="link" onClick={onClose}>
        ‹ Voltar para a equipe
      </button>
      <form className="form section" onSubmit={submit} aria-labelledby="editar-profissional">
        <h2 id="editar-profissional">{p.name}</h2>
        <label>
          Nome
          <input
            value={name}
            required
            minLength={2}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!p.isOwner && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Atendendo (desmarque para o robô parar de oferecer horários com ela)
          </label>
        )}
        <fieldset className="fieldset">
          <legend>Serviços que ela faz</legend>
          {services.map((s) => (
            <label key={s.id} className="check">
              <input
                type="checkbox"
                checked={serviceIds.has(s.id)}
                onChange={(e) => toggleService(s.id, e.target.checked)}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <h3>Horários dela</h3>
        <WeekHours days={days} onChange={setDays} />
        <div className="sticky-save">
          {status && <Banner kind={status.ok ? 'ok' : 'error'}>{status.text}</Banner>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
      {!p.isOwner && <Access professional={p} onChanged={onSaved} />}
    </>
  );
}

/** Acesso ao painel: ela vê e marca só a própria agenda. Senha provisória aparece uma vez. */
function Access({
  professional: p,
  onChanged,
}: {
  professional: Professional;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await api<{ email: string; temporaryPassword: string }>(`/panel/team/${p.id}/login`, {
          method: 'POST',
          body: { email },
        }),
      );
      onChanged();
    } catch (e) {
      setError(message(e, 'Não foi possível criar o acesso.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/panel/team/${p.id}/login`, { method: 'DELETE' });
      setConfirmRemove(false);
      setCreated(null);
      onChanged();
    } catch (e) {
      setError(message(e, 'Não foi possível tirar o acesso.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section card" aria-labelledby="acesso">
      <h2 id="acesso">Acesso ao painel</h2>
      <p className="muted small">
        Com acesso, ela entra no painel e vê só a agenda dela: marca realizado ou faltou. Não vê
        clientes, conversas nem resultados.
      </p>
      {error && <Banner>{error}</Banner>}
      {created ? (
        <div className="banner banner--ok" role="status">
          <p>
            Acesso criado para <strong>{created.email}</strong>.
          </p>
          <p>
            Senha provisória: <code className="secret">{created.temporaryPassword}</code>
          </p>
          <p className="small">
            Mande para ela por um canal seu. Esta senha não aparece de novo; no primeiro acesso ela
            cria a própria.
          </p>
        </div>
      ) : p.login ? (
        confirmRemove ? (
          <div className="privacy__confirm" role="group" aria-label="Tirar acesso">
            <p>
              Tirar o acesso de <strong>{p.login}</strong>? Ela sai do painel na hora. A agenda dela
              continua.
            </p>
            <div className="row privacy__actions">
              <button
                type="button"
                className="button button--small"
                disabled={busy}
                onClick={remove}
              >
                Sim, tirar acesso
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setConfirmRemove(false)}
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="row row--between">
            <span>{p.login}</span>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => setConfirmRemove(true)}
            >
              Tirar acesso
            </button>
          </div>
        )
      ) : (
        <form className="form" onSubmit={create}>
          <label>
            E-mail dela
            <input
              type="email"
              required
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="button button--ghost" disabled={busy}>
            {busy ? 'Criando…' : 'Criar acesso'}
          </button>
        </form>
      )}
    </section>
  );
}
