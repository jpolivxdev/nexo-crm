import { Store } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { useLoad } from '../lib/hooks';
import type { TenantRow } from '../lib/types';
import { NICHES } from '../lib/niches';

const NICHE_LABEL = Object.fromEntries(NICHES.map((n) => [n.value, n.label]));
const ADMIN_TZ = 'America/Sao_Paulo';

function onboardingText(t: TenantRow): string {
  if (t.onboardingMinutes !== null) return `Configurado em ${t.onboardingMinutes} min`;
  if (t.onboardingStartedAt) return 'Configuração em andamento';
  return 'Sem configuração';
}

/**
 * Área do admin nexo: lista de negócios (só nome, nicho e tempo de configuração),
 * criação de negócio e entrada registrada (motivo + código do app autenticador, 1 hora).
 */
export function Admin() {
  const { data, error, loading, reload } = useLoad(
    () => api<TenantRow[]>('/admin/tenants'),
    'admin-tenants',
  );
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ ownerEmail: string; temporaryPassword: string } | null>(
    null,
  );
  const [entering, setEntering] = useState<TenantRow | null>(null);

  return (
    <>
      <header className="page-header">
        <h1>Negócios</h1>
        <p className="muted">
          Você vê só os dados de cadastro. Clientes e conversas ficam fechados.
        </p>
      </header>

      {created && (
        <section className="card card--attention" aria-labelledby="criado-titulo">
          <h2 id="criado-titulo">Negócio criado</h2>
          <p>
            Login da dona: <strong>{created.ownerEmail}</strong>
          </p>
          <p>
            Senha provisória: <code className="secret">{created.temporaryPassword}</code>
          </p>
          <p className="muted small">
            Esta senha aparece só agora. Passe para a dona por um canal seguro; no primeiro acesso o
            painel pede uma senha nova.
          </p>
          <button type="button" className="button button--small" onClick={() => setCreated(null)}>
            Já anotei
          </button>
        </section>
      )}

      {creating ? (
        <CreateTenant
          onCancel={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCreated(result);
            void reload();
          }}
        />
      ) : (
        <button type="button" className="button" onClick={() => setCreating(true)}>
          Criar negócio
        </button>
      )}

      {entering && <EnterTenant tenant={entering} onCancel={() => setEntering(null)} />}

      <section className="section" aria-labelledby="lista-titulo">
        <h2 id="lista-titulo">Todos os negócios</h2>
        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <Banner>{error}</Banner>
        ) : !data?.length ? (
          <Empty title="Nenhum negócio ainda" icon={<Store size={24} />}>
            Crie o primeiro negócio; o tempo de configuração aparece aqui quando a dona concluir o
            assistente.
          </Empty>
        ) : (
          <ul className="list">
            {data.map((t) => (
              <li key={t.id} className="card">
                <div className="row row--between">
                  <strong>{t.name}</strong>
                  <span className="tag">{NICHE_LABEL[t.niche] ?? t.niche}</span>
                </div>
                <p className="muted small">
                  Criado em {dateTime(t.createdAt, ADMIN_TZ)} · {onboardingText(t)}
                </p>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => setEntering(t)}
                >
                  Entrar para dar suporte
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CreateTenant({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (result: { ownerEmail: string; temporaryPassword: string }) => void;
}) {
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('cilios');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await api<{ ownerEmail: string; temporaryPassword: string }>('/admin/tenants', {
          method: 'POST',
          body: { name, niche, ownerName, ownerEmail, timezone: ADMIN_TZ },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível criar o negócio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate aria-labelledby="novo-titulo">
      <h2 id="novo-titulo">Novo negócio</h2>
      <label>
        Nome do negócio
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </label>
      <label>
        Tipo de negócio
        <select value={niche} onChange={(e) => setNiche(e.target.value)}>
          {NICHES.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Nome da dona
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          maxLength={120}
          required
        />
      </label>
      <label>
        E-mail da dona (login)
        <input
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          maxLength={254}
          required
        />
      </label>
      <p className="muted small">
        As etapas começam no modelo do tipo de negócio. Serviços e horários a dona preenche no
        assistente.
      </p>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Criando…' : 'Criar'}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EnterTenant({ tenant, onCancel }: { tenant: TenantRow; onCancel: () => void }) {
  const { refresh } = useAuth();
  const [reason, setReason] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setError('Explique o motivo (pelo menos 10 caracteres).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/tenants/${tenant.id}/access`, {
        method: 'POST',
        body: { reason: reason.trim(), totp },
      });
      window.location.hash = '/hoje';
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <form
      className="card form card--attention"
      onSubmit={submit}
      noValidate
      aria-labelledby="entrar-titulo"
    >
      <h2 id="entrar-titulo">Entrar em {tenant.name}</h2>
      <p className="muted">
        A entrada dura 1 hora e fica registrada com o motivo, a data e o seu usuário.
      </p>
      <label>
        Motivo
        <textarea
          rows={3}
          value={reason}
          maxLength={500}
          placeholder="Ex.: ajudar a dona a cadastrar os serviços, a pedido dela por WhatsApp"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label>
        Código do app autenticador
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
