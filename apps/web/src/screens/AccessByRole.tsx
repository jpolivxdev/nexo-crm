import { ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/hooks';
import { AREAS, ROLE_HINT, ROLE_LABEL, TEAM_ROLES, type AccessRules } from '../lib/roles';

interface AccessData {
  available: boolean;
  rules: AccessRules;
  requireMfa: boolean;
}

/**
 * Configurações → Acessos (Premium, só o dono): liga e desliga o que cada papel vê, e exige a
 * verificação em duas etapas de dono e gestores. O dono vê tudo sempre; o servidor aplica.
 */
export function AccessByRole({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<AccessData>('/panel/access'), '');

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  return <AccessForm go={go} data={data} reload={reload} />;
}

function AccessForm({
  go,
  data,
  reload,
}: {
  go: (to: string) => void;
  data: AccessData;
  reload: () => Promise<unknown> | void;
}) {
  const { me, refresh } = useAuth();
  const [rules, setRules] = useState<AccessRules>(data.rules);
  const [requireMfa, setRequireMfa] = useState(data.requireMfa);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await api('/panel/access', { method: 'PUT', body: { rules, requireMfa } });
      setStatus({
        ok: true,
        text: 'Acessos salvos. Vale a partir da próxima tela que a equipe abrir.',
      });
      await reload();
      await refresh();
    } catch (e) {
      setStatus({
        ok: false,
        text: e instanceof ApiError ? e.message : 'Não foi possível salvar.',
      });
    } finally {
      setSaving(false);
    }
  }

  const toggle = (role: keyof AccessRules, area: keyof AccessRules['MANAGER'], on: boolean) =>
    setRules((r) => ({ ...r, [role]: { ...r[role], [area]: on } }));

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <PageHeader
        Icon={ShieldCheck}
        title="Acessos por papel"
        subtitle="Você vê tudo. Aqui você decide o que gestor, consultor e profissional veem."
      />
      {!data.available && (
        <Banner kind="ok">
          Acessos por papel fazem parte do plano Premium. No Básico, a equipe vê só a própria
          agenda.
        </Banner>
      )}
      <form className="section card access" onSubmit={save} aria-labelledby="acessos-areas">
        <h2 id="acessos-areas">O que cada papel vê</h2>
        <p className="muted small">
          Agenda, conversas, clientes e etapas fazem parte do dia a dia de gestor e consultor. A
          profissional vê só a própria agenda.
        </p>
        <div className="access__scroll">
          <table className="access__table">
            <thead>
              <tr>
                <th scope="col">Área</th>
                {TEAM_ROLES.map((role) => (
                  <th key={role} scope="col" title={ROLE_HINT[role]}>
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((area) => (
                <tr key={area.id}>
                  <th scope="row">
                    <span className="access__area">{area.label}</span>
                    <span className="muted small">{area.hint}</span>
                  </th>
                  {TEAM_ROLES.map((role) => (
                    <td key={role}>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          disabled={!data.available || role === 'STAFF'}
                          checked={rules[role][area.id]}
                          aria-label={`${area.label}: ${ROLE_LABEL[role]}`}
                          onChange={(e) => toggle(role, area.id, e.target.checked)}
                        />
                        <span aria-hidden="true" />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="acessos-2fa">Verificação em duas etapas</h2>
        <label className="check choice">
          <input
            type="checkbox"
            disabled={!data.available}
            checked={requireMfa}
            onChange={(e) => setRequireMfa(e.target.checked)}
          />
          <span>
            <strong>Exigir de dono e gestores</strong>
            <span className="muted small">
              {' '}
              Quem não tiver ligado só volta a usar o painel depois de ligar.
              {!me?.twoFactor && ' Antes, ligue a sua em Meu perfil e segurança.'}
            </span>
          </span>
        </label>

        {status && <Banner kind={status.ok ? 'ok' : undefined}>{status.text}</Banner>}
        <button type="submit" className="button" disabled={saving || !data.available}>
          {saving ? 'Salvando…' : 'Salvar acessos'}
        </button>
      </form>
    </>
  );
}
