import { ChartColumn } from 'lucide-react';
import { useState } from 'react';
import { TrendChart } from '../components/TrendChart';
import { Banner, Empty, Loading } from '../components/ui';
import { api } from '../lib/api';
import { localDateLabel } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Report as ReportData, ReportCount } from '../lib/types';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const;

/** Resultados do negócio (M9 mínimo): o que o robô resolveu e o que precisou da dona. */
export function Report() {
  const [days, setDays] = useState<ReportData['days']>(30);
  const { data, error, loading, reload } = useLoad(
    () => api<ReportData>(`/panel/report?days=${days}`),
    `report-${days}`,
  );
  useRealtime((n) => {
    if (n.type === 'agenda.changed' || n.type === 'handoff.requested') void reload();
  });

  return (
    <>
      <header className="page-header">
        <h1>Resultados</h1>
        {data && (
          <p className="muted">
            De {localDateLabel(data.from)} até {localDateLabel(data.to)}
          </p>
        )}
      </header>

      <div className="segmented" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={days === p.days}
            className={days === p.days ? 'on' : ''}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Banner>{error}</Banner>
      ) : data ? (
        <Body data={data} />
      ) : null}
    </>
  );
}

function Body({ data }: { data: ReportData }) {
  const { booked, outcomes } = data;
  const nothing = booked.total === 0 && data.newContacts === 0 && outcomes.done === 0;
  if (nothing) {
    return (
      <div className="section">
        <Empty title="Ainda não há resultados neste período" icon={<ChartColumn size={24} />}>
          Quando as clientes marcarem pelo WhatsApp, aqui aparece quantos horários o robô marcou,
          quantas faltaram e quantas pediram para falar com você.
        </Empty>
      </div>
    );
  }
  const botShare = booked.total ? Math.round((booked.byBot / booked.total) * 100) : 0;

  return (
    <>
      <section className="section" aria-labelledby="agendamentos">
        <h2 id="agendamentos">Horários marcados</h2>
        <dl className="stats stats--two">
          <div className="stat stat--attention">
            <dt>Pelo robô</dt>
            <dd>{booked.byBot}</dd>
          </div>
          <div className="stat">
            <dt>Por você no painel</dt>
            <dd>{booked.byPanel}</dd>
          </div>
        </dl>
        {booked.total > 0 && (
          <p className="muted">
            O robô marcou {botShare}% dos {booked.total} horários do período sozinho.
          </p>
        )}
      </section>

      {data.daily.length > 0 && (
        <section className="card section trend-card" aria-labelledby="por-dia">
          <h2 id="por-dia">Dia a dia</h2>
          <TrendChart data={data.daily} title="Horários marcados e realizados por dia" />
        </section>
      )}

      <section className="section" aria-labelledby="atendimentos">
        <h2 id="atendimentos">Atendimentos</h2>
        <dl className="stats">
          <div className="stat">
            <dt>Realizados</dt>
            <dd>{outcomes.done}</dd>
          </div>
          <div className="stat">
            <dt>Faltaram</dt>
            <dd>{outcomes.noShow}</dd>
          </div>
          <div className="stat">
            <dt>Cancelados</dt>
            <dd>{outcomes.cancelled}</dd>
          </div>
        </dl>
        <p className="muted">
          {outcomes.noShowRate === null
            ? 'A taxa de faltas aparece depois dos primeiros atendimentos.'
            : `Taxa de faltas: ${outcomes.noShowRate}% (faltaram ÷ realizados + faltaram).`}
        </p>
      </section>

      <section className="section" aria-labelledby="clientes">
        <h2 id="clientes">Clientes</h2>
        <dl className="stats">
          <div className="stat">
            <dt>Novos contatos</dt>
            <dd>{data.newContacts}</dd>
          </div>
          <div className="stat">
            <dt>Pediram você</dt>
            <dd>{data.handoffs}</dd>
          </div>
          <div className="stat">
            <dt>Pediram para parar</dt>
            <dd>{data.optOuts}</dd>
          </div>
        </dl>
        {data.confirmedByClient > 0 && (
          <p className="muted">
            {data.confirmedByClient === 1
              ? '1 cliente confirmou o horário pelo lembrete.'
              : `${data.confirmedByClient} clientes confirmaram o horário pelo lembrete.`}
          </p>
        )}
      </section>

      <Bars title="Clientes em cada etapa (agora)" id="por-etapa" rows={data.byStage} />
      {data.byProfessional.length > 1 && (
        <Bars
          title="Atendimentos por profissional"
          id="por-profissional"
          rows={data.byProfessional}
        />
      )}
    </>
  );
}

/** Barras horizontais simples. O número fica sempre escrito: nada só por cor ou tamanho. */
function Bars({ title, id, rows }: { title: string; id: string; rows: ReportCount[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="bars card">
        {rows.map((r) => (
          <li key={r.id} className="bars__row">
            <span className="bars__label">{r.name}</span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <strong className="bars__value">{r.count}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
