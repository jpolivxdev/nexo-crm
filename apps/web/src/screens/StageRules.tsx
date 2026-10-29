import { type FormEvent, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useLoad } from '../lib/hooks';

interface RuleRow {
  event: string;
  defaultStageId: string | null;
  /** Ausente = segue o padrão; null = não mexe na etapa. */
  stageId?: string | null;
}

interface RulesData {
  stages: { id: string; name: string }[];
  rules: RuleRow[];
}

/** Acontecimento na língua da dona ("Se a cliente..."). */
export const EVENT_LABEL: Record<string, string> = {
  'contact.created': 'mandou a primeira mensagem',
  'faq.viewed': 'viu as dúvidas',
  'appointment.created': 'marcou horário',
  'appointment.confirmed': 'confirmou o horário',
  'appointment.done': 'foi atendida',
  'appointment.returned': 'foi atendida de novo (2ª vez ou mais)',
  'appointment.no_show': 'faltou',
  'appointment.cancelled': 'cancelou o horário',
  'handoff.requested': 'pediu para falar com você',
  'contact.opted_out': 'pediu para parar de receber mensagens',
};

const DEFAULT = '__padrao';
const KEEP = '__manter';

/** "Se X, colocar em Y": a dona escolhe para onde cada acontecimento leva a cliente. */
export function StageRules({ go }: { go: (to: string) => void }) {
  const { data, error, loading } = useLoad(() => api<RulesData>('/panel/pipeline/rules'), '');
  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  return <RulesForm data={data} go={go} />;
}

function RulesForm({ data, go }: { data: RulesData; go: (to: string) => void }) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.rules.map((r) => [
        r.event,
        r.stageId === undefined ? DEFAULT : r.stageId === null ? KEEP : r.stageId,
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const stageName = (id: string | null) => data.stages.find((s) => s.id === id)?.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const rules = Object.entries(choice)
        .filter(([, value]) => value !== DEFAULT)
        .map(([ev, value]) => ({ event: ev, stageId: value === KEEP ? null : value }));
      await api('/panel/pipeline/rules', { method: 'PUT', body: { rules } });
      setStatus({ ok: true, text: 'Regras salvas. Valem a partir de agora.' });
    } catch (e) {
      setStatus({
        ok: false,
        text: e instanceof ApiError ? e.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/etapas')}>
        ‹ Etapas
      </button>
      <header className="page-header">
        <h1>Regras automáticas</h1>
        <p className="muted">
          Escolha para qual etapa a cliente vai quando algo acontece. O padrão já funciona; mude só
          o que fizer sentido para o seu negócio. Você continua podendo mover à mão.
        </p>
      </header>
      <form className="form" onSubmit={submit}>
        <ul className="list">
          {data.rules.map((r) => {
            const fallback = stageName(r.defaultStageId);
            return (
              <li key={r.event} className="card rule">
                <label htmlFor={`regra-${r.event}`}>
                  Se a cliente <strong>{EVENT_LABEL[r.event] ?? r.event}</strong>, colocar em
                </label>
                <select
                  id={`regra-${r.event}`}
                  value={choice[r.event] ?? DEFAULT}
                  onChange={(e) => {
                    setChoice((c) => ({ ...c, [r.event]: e.target.value }));
                    setStatus(null);
                  }}
                >
                  <option value={DEFAULT}>
                    {fallback ? `Padrão (${fallback})` : 'Padrão (não muda)'}
                  </option>
                  {data.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={KEEP}>Não mudar a etapa</option>
                </select>
              </li>
            );
          })}
        </ul>
        <div className="sticky-save">
          {status && <Banner kind={status.ok ? 'ok' : 'error'}>{status.text}</Banner>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar regras'}
          </button>
        </div>
      </form>
    </>
  );
}
