import { Gauge, LayoutDashboard, Monitor, Target, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Loading, Sheet } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { money, shortDate } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Forecast } from '../lib/types';
import { monthLabel } from './CrmPremium';

type Period = 'week' | 'month' | 'quarter';
type GoalKey = 'newContacts' | 'wonCount' | 'doneCount' | 'revenueCents';

interface Numbers {
  newContacts: number;
  newDeals: number;
  wonCount: number;
  wonCents: number;
  lostCount: number;
  conversion: number | null;
  doneCount: number;
  revenueCents: number;
  noShowCount: number;
  averageTicketCents: number | null;
}

export interface DashboardData {
  period: Period;
  from: string;
  to: string;
  pipeline: { id: string; name: string };
  pipelines: { id: string; name: string; isDefault: boolean }[];
  people: { id: string; name: string }[];
  numbers: Numbers;
  previous: Numbers;
  changes: Partial<Record<GoalKey, number | null>>;
  goals: Partial<Record<GoalKey, number>>;
  progress: Record<GoalKey, number>;
  funnel: { id: string; name: string; reached: number; percent: number }[];
  byOwner: {
    id: string | null;
    name: string;
    openDeals: number;
    openCents: number;
    openTasks: number;
  }[];
  forecast: Forecast;
}

const PERIODS: { id: Period; label: string; goalLabel: string }[] = [
  { id: 'week', label: 'Semana', goalLabel: 'da semana' },
  { id: 'month', label: 'Mês', goalLabel: 'do mês' },
  { id: 'quarter', label: 'Trimestre', goalLabel: 'do trimestre' },
];

const GOALS: { key: GoalKey; label: string; money?: boolean }[] = [
  { key: 'newContacts', label: 'Novos contatos' },
  { key: 'wonCount', label: 'Atendimentos fechados' },
  { key: 'doneCount', label: 'Atendimentos realizados' },
  { key: 'revenueCents', label: 'Faturamento', money: true },
];

const fmt = (key: GoalKey, n: number) => (key === 'revenueCents' ? money(n) : String(n));

function Change({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className={
        up ? 'dash-kpi__change dash-kpi__change--up' : 'dash-kpi__change dash-kpi__change--down'
      }
    >
      {up ? '▲' : '▼'} {Math.abs(value)}%{' '}
      <span className="sr-only">em relação ao período anterior</span>
    </span>
  );
}

function Kpis({ data }: { data: DashboardData }) {
  const n = data.numbers;
  const items: { label: string; value: string; change?: number | null; hint?: string }[] = [
    { label: 'Novos contatos', value: String(n.newContacts), change: data.changes.newContacts },
    { label: 'Atendimentos novos', value: String(n.newDeals) },
    {
      label: 'Fechados',
      value: String(n.wonCount),
      change: data.changes.wonCount,
      hint: n.wonCents > 0 ? money(n.wonCents) : undefined,
    },
    {
      label: 'Conversão',
      value: n.conversion == null ? '—' : `${n.conversion}%`,
      hint: `${n.wonCount} fechados, ${n.lostCount} não seguiram`,
    },
    { label: 'Realizados', value: String(n.doneCount), change: data.changes.doneCount },
    { label: 'Faturamento', value: money(n.revenueCents), change: data.changes.revenueCents },
    {
      label: 'Ticket médio',
      value: n.averageTicketCents == null ? '—' : money(n.averageTicketCents),
    },
    { label: 'Faltas', value: String(n.noShowCount) },
  ];
  return (
    <ul className="dash-kpis" aria-label="Indicadores do período">
      {items.map((i) => (
        <li key={i.label} className="dash-kpi">
          <span className="dash-kpi__label">{i.label}</span>
          <strong className="dash-kpi__value">{i.value}</strong>
          <Change value={i.change} />
          {i.hint && <span className="muted small">{i.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

function GoalBars({ data }: { data: DashboardData }) {
  const rows = GOALS.filter((g) => data.goals[g.key]);
  if (rows.length === 0)
    return <p className="muted small">Sem metas para este período. Toque em Metas para definir.</p>;
  return (
    <ul className="goals__list">
      {rows.map((g) => {
        const goal = data.goals[g.key]!;
        const done = data.progress[g.key];
        const p = Math.min(100, Math.round((done / goal) * 100));
        const id = `meta-${g.key}`;
        return (
          <li key={g.key}>
            <p className="goals__line">
              <span id={id}>{g.label}</span>
              <strong>
                {fmt(g.key, done)} de {fmt(g.key, goal)}
              </strong>
            </p>
            <div
              className="goals__bar"
              role="progressbar"
              aria-labelledby={id}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p}
              aria-valuetext={`${p}% da meta`}
            >
              <span style={{ width: `${p}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Funnel({ data }: { data: DashboardData }) {
  const total = data.funnel[0]?.reached ?? 0;
  if (total === 0)
    return (
      <p className="muted small">
        Quando entrar um atendimento neste funil no período, a conversão aparece aqui.
      </p>
    );
  return (
    <ol className="funnel" aria-label={`Funil de conversão: ${data.pipeline.name}`}>
      {data.funnel.map((s) => (
        <li key={s.id} className="funnel__step">
          <span className="funnel__name">{s.name}</span>
          <span className="funnel__bar" aria-hidden="true">
            <span style={{ width: `${Math.max(s.percent, 2)}%` }} />
          </span>
          <span className="funnel__count">
            {s.reached} <span className="muted small">({s.percent}%)</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Painéis (Premium): comercial, metas por período, funil de conversão e Modo TV. */
export function Dashboards() {
  const [period, setPeriod] = useState<Period>('month');
  const [pipelineId, setPipelineId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [editing, setEditing] = useState(false);
  const [tv, setTv] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () =>
      api<DashboardData>('/panel/crm/dashboard', {
        query: {
          period,
          ...(pipelineId ? { pipelineId } : {}),
          ...(ownerUserId ? { ownerUserId } : {}),
        },
      }),
    `painel-${period}-${pipelineId}-${ownerUserId}`,
  );
  useRealtime(
    (n) => (n.type === 'agenda.changed' || n.type === 'contact.updated') && void reload(),
  );

  // Modo TV: atualiza sozinho a cada minuto.
  useEffect(() => {
    if (!tv) return;
    const handle = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(handle);
  }, [tv, reload]);

  function openTv() {
    setTv(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
  function closeTv() {
    setTv(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  }

  const periodInfo = PERIODS.find((p) => p.id === period)!;

  return (
    <>
      <PageHeader
        Icon={LayoutDashboard}
        title="Painéis"
        subtitle={
          data
            ? `De ${shortDate(data.from)} a ${shortDate(data.to)}, comparado com o período anterior.`
            : 'Os números do comercial, as metas e o funil.'
        }
        actions={
          <>
            <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
              <Target aria-hidden="true" size={16} /> Metas
            </button>
            <button type="button" className="button" onClick={openTv} disabled={!data}>
              <Monitor aria-hidden="true" size={16} /> Modo TV
            </button>
          </>
        }
      />
      <div className="dash-filters">
        <div className="segmented" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              className={period === p.id ? 'on' : ''}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">Funil</span>
          <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
            <option value="">Todos os funis</option>
            {data?.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Responsável</span>
          <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
            <option value="">Toda a equipe</option>
            {data?.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {editing && data && (
        <GoalsSheet
          period={period}
          label={periodInfo.goalLabel}
          goals={data.goals}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Banner>{error}</Banner>
      ) : data ? (
        <>
          <Kpis data={data} />
          <div className="dash-grid">
            <section className="card section" aria-labelledby="metas-periodo">
              <h2 id="metas-periodo">Metas {periodInfo.goalLabel}</h2>
              <GoalBars data={data} />
            </section>
            <section className="card section" aria-labelledby="funil-conversao">
              <h2 id="funil-conversao">Funil de conversão</h2>
              <p className="muted small">
                Dos atendimentos que entraram em {data.pipeline.name} no período, quantos chegaram a
                cada etapa.
              </p>
              <Funnel data={data} />
            </section>
            <section className="card section" aria-labelledby="por-pessoa">
              <h2 id="por-pessoa">Por responsável</h2>
              {data.byOwner.length === 0 ? (
                <p className="muted small">Nenhum atendimento em andamento.</p>
              ) : (
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th scope="col">Pessoa</th>
                      <th scope="col">Em andamento</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Tarefas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byOwner.map((o) => (
                      <tr key={o.id ?? 'ninguem'}>
                        <th scope="row">{o.name}</th>
                        <td>{o.openDeals}</td>
                        <td>{money(o.openCents)}</td>
                        <td>{o.openTasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card section" aria-labelledby="previsao-mensal">
              <h2 id="previsao-mensal">Previsão mensal</h2>
              <p className="muted small">
                Em aberto {money(data.forecast.openCents)} · previsão{' '}
                {money(data.forecast.weightedCents)}
              </p>
              {data.forecast.byMonth.length === 0 ? (
                <p className="muted small">Atendimentos com valor aparecem aqui.</p>
              ) : (
                <table className="crm-table">
                  <tbody>
                    {data.forecast.byMonth.map((b) => (
                      <tr key={b.month ?? 'sem'}>
                        <th scope="row">{monthLabel(b.month)}</th>
                        <td>{b.count}</td>
                        <td>{money(b.weightedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
          {tv && <TvMode data={data} label={periodInfo.label} onClose={closeTv} />}
        </>
      ) : null}
    </>
  );
}

/** Modo TV: tela cheia, números grandes, atualiza sozinho. Esc ou o botão saem. */
function TvMode({
  data,
  label,
  onClose,
}: {
  data: DashboardData;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const n = data.numbers;
  return (
    <div className="tv" role="dialog" aria-modal="true" aria-label="Modo TV">
      <header className="tv__head">
        <p>
          <Gauge aria-hidden="true" size={22} /> {label} · {shortDate(data.from)} a{' '}
          {shortDate(data.to)}
        </p>
        <button type="button" className="button button--ghost" onClick={onClose}>
          <X aria-hidden="true" size={18} /> Sair do Modo TV
        </button>
      </header>
      <ul className="tv__kpis">
        <li>
          <span>Novos contatos</span>
          <strong>{n.newContacts}</strong>
        </li>
        <li>
          <span>Fechados</span>
          <strong>{n.wonCount}</strong>
        </li>
        <li>
          <span>Realizados</span>
          <strong>{n.doneCount}</strong>
        </li>
        <li>
          <span>Faturamento</span>
          <strong>{money(n.revenueCents)}</strong>
        </li>
      </ul>
      <div className="tv__grid">
        <section>
          <h2>Metas</h2>
          <GoalBars data={data} />
        </section>
        <section>
          <h2>Funil · {data.pipeline.name}</h2>
          <Funnel data={data} />
        </section>
      </div>
    </div>
  );
}

function GoalsSheet({
  period,
  label,
  goals,
  onClose,
  onSaved,
}: {
  period: Period;
  label: string;
  goals: Partial<Record<GoalKey, number>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<GoalKey, string>>(() => ({
    newContacts: goals.newContacts ? String(goals.newContacts) : '',
    wonCount: goals.wonCount ? String(goals.wonCount) : '',
    doneCount: goals.doneCount ? String(goals.doneCount) : '',
    revenueCents: goals.revenueCents ? String(goals.revenueCents / 100) : '',
  }));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);
    const revenue = num(form.revenueCents);
    try {
      await api('/panel/crm/dashboard/goals', {
        method: 'PUT',
        body: {
          period,
          goals: {
            newContacts: num(form.newContacts),
            wonCount: num(form.wonCount),
            doneCount: num(form.doneCount),
            revenueCents: revenue == null ? null : Math.round(revenue * 100),
          },
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Sheet title={`Metas ${label}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {GOALS.map((g) => (
          <label key={g.key}>
            {g.money ? `${g.label} (R$)` : g.label}
            <input
              inputMode={g.money ? 'decimal' : 'numeric'}
              value={form[g.key]}
              onChange={(e) => setForm((f) => ({ ...f, [g.key]: e.target.value }))}
            />
          </label>
        ))}
        <p className="muted small">Deixe em branco para ficar sem meta.</p>
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button">
            Salvar metas
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Painel geral (Hoje) ----------

interface Overview {
  stages: { id: string; name: string; kind: string; count: number }[];
  forecast: Forecast;
  monthRevenueCents: number;
  openTickets: number;
}

/** Painel geral no Hoje (Premium): etapas, previsão, receita do mês e chamados abertos. */
export function OverviewPanel({ go }: { go: (to: string) => void }) {
  const { data } = useLoad(() => api<Overview>('/panel/crm/overview'), 'painel-geral');
  // Sem resposta completa (versão antiga da API ou erro), o Hoje segue sem o painel.
  if (!data?.forecast || !Array.isArray(data.stages)) return null;
  return (
    <section className="card section overview" aria-labelledby="painel-geral">
      <div className="row row--between">
        <h2 id="painel-geral">Painel geral</h2>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => go('/paineis')}
        >
          Ver painéis
        </button>
      </div>
      <ul className="crm-totals overview__totals">
        <li>
          <span className="muted small">Receita do mês</span>
          <strong>{money(data.monthRevenueCents)}</strong>
        </li>
        <li>
          <span className="muted small">Previsão de receita</span>
          <strong>{money(data.forecast.weightedCents)}</strong>
        </li>
        <li>
          <span className="muted small">Chamados abertos</span>
          <strong>{data.openTickets}</strong>
        </li>
      </ul>
      <ul className="overview__stages" aria-label="Contatos por etapa">
        {data.stages.map((s) => (
          <li key={s.id} data-kind={s.kind}>
            <span>{s.name}</span>
            <strong>{s.count}</strong>
          </li>
        ))}
      </ul>
      {data.forecast.byMonth.some((b) => b.month) && (
        <p className="muted small">
          Previsão mensal:{' '}
          {data.forecast.byMonth
            .filter((b) => b.month)
            .slice(0, 3)
            .map((b) => `${monthLabel(b.month)} ${money(b.weightedCents)}`)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}
