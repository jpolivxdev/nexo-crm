import { Target } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

interface GoalsData {
  month: string;
  goals: { doneCount?: number; revenueCents?: number };
  progress: { doneCount: number; revenueCents: number };
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2031-01" → "janeiro". */
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Quanto da meta já foi feito, de 0 a 100 (passa de 100 não estoura a barra). */
export function percent(done: number, goal: number | undefined): number | null {
  if (!goal) return null;
  return Math.min(100, Math.round((done / goal) * 100));
}

/** Metas do mês: atendimentos realizados e faturamento, com barra de progresso. */
export function Goals() {
  const { data, error, reload } = useLoad(() => api<GoalsData>('/panel/goals'), 'goals');
  const [editing, setEditing] = useState(false);
  useRealtime((n) => {
    if (n.type === 'agenda.changed') void reload();
  });

  // Sem metas (plano sem Resultados ou falha): o resto da tela continua.
  if ((error && !data) || !data?.progress) return null;
  const { goals, progress } = data;
  const rows = [
    {
      id: 'meta-realizados',
      label: 'Atendimentos realizados',
      done: progress.doneCount,
      goal: goals.doneCount,
      text: (n: number) => String(n),
    },
    {
      id: 'meta-faturamento',
      label: 'Faturamento',
      done: progress.revenueCents,
      goal: goals.revenueCents,
      text: money,
    },
  ];

  return (
    <section className="card section goals" aria-labelledby="metas">
      <div className="row row--between">
        <h2 id="metas">
          <Target aria-hidden="true" size={18} /> Metas de {monthName(data.month)}
        </h2>
        {!editing && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setEditing(true)}
          >
            {goals.doneCount || goals.revenueCents ? 'Mudar metas' : 'Definir metas'}
          </button>
        )}
      </div>
      {editing ? (
        <GoalsForm
          goals={goals}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      ) : (
        <ul className="goals__list">
          {rows.map((r) => {
            const p = percent(r.done, r.goal);
            return (
              <li key={r.id}>
                <p className="goals__line">
                  <span id={r.id}>{r.label}</span>
                  <strong>
                    {r.text(r.done)}
                    {r.goal ? ` de ${r.text(r.goal)}` : ''}
                  </strong>
                </p>
                {p === null ? (
                  <p className="muted small">Sem meta. Defina para ver quanto falta.</p>
                ) : (
                  <div
                    className="goals__bar"
                    role="progressbar"
                    aria-labelledby={r.id}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={p}
                    aria-valuetext={`${p}% da meta`}
                  >
                    <span style={{ width: `${p}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">
        Faturamento soma o preço dos serviços realizados no mês. Serviço sem preço não entra.
      </p>
    </section>
  );
}

function GoalsForm({
  goals,
  onCancel,
  onSaved,
}: {
  goals: GoalsData['goals'];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [done, setDone] = useState(goals.doneCount ? String(goals.doneCount) : '');
  const [revenue, setRevenue] = useState(
    goals.revenueCents ? String(Math.round(goals.revenueCents / 100)) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const toInt = (v: string) => {
      const n = Number(v.replace(/\D/g, ''));
      return n > 0 ? n : null;
    };
    try {
      await api('/panel/goals', {
        method: 'PUT',
        body: {
          doneCount: toInt(done),
          revenueCents: toInt(revenue) === null ? null : toInt(revenue)! * 100,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Atendimentos realizados no mês
        <input
          inputMode="numeric"
          value={done}
          onChange={(e) => setDone(e.target.value)}
          placeholder="Ex.: 50"
        />
      </label>
      <label>
        Faturamento do mês, em reais
        <input
          inputMode="numeric"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          placeholder="Ex.: 8000"
        />
      </label>
      <p className="muted small">Deixe em branco para ficar sem meta.</p>
      {error && <Banner>{error}</Banner>}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          Salvar metas
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </form>
  );
}
