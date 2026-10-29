import { ArrowRight, CalendarClock, Clock3, MoreHorizontal } from 'lucide-react';
import { type DragEvent, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Pipeline as PipelineData, PipelineDeal, PipelineStage } from '../lib/types';

const DAY = 24 * 60 * 60 * 1000;

/** O que aparece em cada coluna vazia (pela chave fixa da etapa; o nome a dona pode trocar). */
const EMPTY_HINT: Record<string, string> = {
  new: 'Quem escrever pela primeira vez aparece aqui.',
  asked_info: 'Quem pedir preço ou informação aparece aqui.',
  scheduled: 'Quem marcar um horário aparece aqui.',
  attended: 'Quem foi atendida aparece aqui.',
  returned: 'Quem voltar para outro atendimento aparece aqui.',
  lost: 'Quem faltou ou desistiu aparece aqui.',
};

export function sinceLabel(since: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(since).getTime()) / DAY);
  if (days <= 0) return 'Aqui desde hoje';
  return days === 1 ? 'Aqui há 1 dia' : `Aqui há ${days} dias`;
}

export function nextLabel(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday').replace('.', '')} ${get('day')}/${get('month')}, ${get('hour')}:${get('minute')}`;
}

/**
 * Etapas em quadro: uma coluna por etapa, todas na mesma linha. "Não seguiu" fica no fim, como
 * saída do funil. Mover por toque (Avançar ou Mover) e, no computador, também arrastando.
 */
export function Pipeline({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(
    () => api<PipelineData>('/panel/pipeline'),
    'pipeline',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  useRealtime(() => void reload());

  async function move(dealId: string, stageId: string) {
    setActionError(null);
    try {
      await api(`/panel/deals/${dealId}/stage`, { method: 'POST', body: { stageId } });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível mover.');
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;

  const funnel = data.stages.filter((s) => s.kind !== 'LOST');
  const exits = data.stages.filter((s) => s.kind === 'LOST');
  const nextOf = (stage: PipelineStage) => funnel[funnel.indexOf(stage) + 1] ?? null;

  const jump = (id: string) =>
    document
      .getElementById(`coluna-${id}`)
      ?.scrollIntoView?.({ behavior: 'smooth', inline: 'start', block: 'nearest' });

  const column = (stage: PipelineStage) => (
    <section
      key={stage.id}
      id={`coluna-${stage.id}`}
      className={[
        'column',
        stage.kind === 'LOST' ? 'column--exit' : '',
        dropTarget === stage.id ? 'column--drop' : '',
      ].join(' ')}
      aria-labelledby={`etapa-${stage.id}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropTarget(stage.id);
      }}
      onDragLeave={() => setDropTarget((t) => (t === stage.id ? null : t))}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDropTarget(null);
        const dealId = e.dataTransfer.getData('text/plain');
        const from = data.stages.find((s) => s.deals.some((d) => d.id === dealId));
        if (dealId && from && from.id !== stage.id) void move(dealId, stage.id);
      }}
    >
      <h2 id={`etapa-${stage.id}`} className="column__title">
        <span>{stage.name}</span>
        <span className="count" aria-label={`${stage.deals.length} clientes`}>
          {stage.deals.length}
        </span>
      </h2>
      {stage.deals.length === 0 ? (
        <p className="column__empty">{EMPTY_HINT[stage.key ?? ''] ?? 'Ninguém aqui ainda.'}</p>
      ) : (
        <ul className="column__cards">
          {stage.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              next={nextOf(stage)}
              stages={data.stages}
              timeZone={data.timeZone}
              onOpen={() => go(`/clientes/${deal.contact.id}`)}
              onMove={(stageId) => void move(deal.id, stageId)}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <header className="page-header">
        <div className="row row--between">
          <h1>Etapas</h1>
          <button type="button" className="button button--ghost" onClick={() => go('/regras')}>
            Regras automáticas
          </button>
        </div>
        <p className="muted">O robô move sozinho; você pode mudar a qualquer momento.</p>
      </header>
      {actionError && <Banner>{actionError}</Banner>}

      <nav className="stage-chips" aria-label="Ir para a etapa">
        {data.stages.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.kind === 'LOST' ? 'stage-chip stage-chip--exit' : 'stage-chip'}
            onClick={() => jump(s.id)}
          >
            {s.name} <span className="count">{s.deals.length}</span>
          </button>
        ))}
      </nav>

      <div className="board">
        {funnel.map(column)}
        {exits.length > 0 && <div className="board__divider" aria-hidden="true" />}
        {exits.map(column)}
      </div>
    </>
  );
}

function DealCard({
  deal,
  stage,
  next,
  stages,
  timeZone,
  onOpen,
  onMove,
}: {
  deal: PipelineDeal;
  stage: PipelineStage;
  next: PipelineStage | null;
  stages: PipelineStage[];
  timeZone: string;
  onOpen: () => void;
  onMove: (stageId: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const name = contactName(deal.contact);
  const menuId = `mover-${deal.id}`;

  return (
    <li
      className="deal"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button type="button" className="deal__name" onClick={onOpen}>
        {name}
      </button>
      <p className="deal__meta">
        <span>
          <Clock3 aria-hidden="true" size={14} /> {sinceLabel(deal.since)}
        </span>
        {deal.nextAt && (
          <span>
            <CalendarClock aria-hidden="true" size={14} /> Próximo:{' '}
            {nextLabel(deal.nextAt, timeZone)}
          </span>
        )}
      </p>
      <div className="deal__actions">
        {next && stage.kind !== 'LOST' && (
          <button
            type="button"
            className="button button--small button--ghost deal__advance"
            aria-label={`Avançar ${name} para ${next.name}`}
            onClick={() => onMove(next.id)}
          >
            {next.name} <ArrowRight aria-hidden="true" size={16} />
          </button>
        )}
        <button
          type="button"
          className="icon-button deal__more"
          aria-label={`Mover ${name}`}
          aria-expanded={menu}
          aria-controls={menuId}
          onClick={() => setMenu((m) => !m)}
        >
          <MoreHorizontal aria-hidden="true" size={18} />
        </button>
      </div>
      {menu && (
        <div id={menuId} className="deal__menu">
          <p className="deal__menu-title" aria-hidden="true">
            Mover para
          </p>
          <ul aria-label={`Mover ${name} para`}>
            {stages
              .filter((s) => s.id !== stage.id)
              .map((s) => (
                <li key={s.id} className={s.kind === 'LOST' ? 'deal__menu-lost' : undefined}>
                  <button
                    type="button"
                    aria-label={`Mover para ${s.name}`}
                    onClick={() => {
                      setMenu(false);
                      onMove(s.id);
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </li>
  );
}
