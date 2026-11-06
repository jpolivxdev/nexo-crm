import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Columns3,
  List,
  MoreHorizontal,
  SquareKanban,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { type DragEvent, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, money, phone } from '../lib/format';
import { NewContact } from './Contacts';
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
  const [view, setView] = useState<'quadro' | 'lista'>(readView);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  useRealtime(() => void reload());

  function pickView(v: 'quadro' | 'lista') {
    setView(v);
    saveView(v);
  }

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

  // Busca por nome ou telefone: filtra os cartões, as colunas continuam todas.
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const match = (d: PipelineDeal) =>
    !term ||
    (d.contact.name ?? '').toLowerCase().includes(term) ||
    (digits.length > 0 && d.contact.phone.includes(digits));
  const stagesShown = data.stages.map((s) => ({ ...s, deals: s.deals.filter(match) }));
  const funnel = stagesShown.filter((s) => s.kind !== 'LOST');
  const exits = stagesShown.filter((s) => s.kind === 'LOST');
  const all = stagesShown.flatMap((s) => s.deals.map((d) => ({ deal: d, stage: s })));
  const openValue = funnel.reduce((sum, s) => sum + stageValue(s), 0);
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
      data-tom={stage.kind === 'LOST' ? undefined : funnel.indexOf(stage) % 5}
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
        <span className="column__dot" aria-hidden="true" />
        <span className="column__name">{stage.name}</span>
        <span className="count" aria-label={`${stage.deals.length} clientes`}>
          {stage.deals.length}
        </span>
        {stageValue(stage) > 0 && (
          <span className="column__value" title="Soma dos próximos horários desta etapa">
            {money(stageValue(stage))}
          </span>
        )}
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
      <PageHeader
        Icon={SquareKanban}
        title="Etapas"
        subtitle="Cada cliente, do primeiro contato até voltar. O robô move sozinho; você pode mudar a qualquer momento."
        actions={
          <>
            <button type="button" className="button button--ghost" onClick={() => go('/regras')}>
              Regras automáticas
            </button>
            {!adding && (
              <button type="button" className="button" onClick={() => setAdding(true)}>
                Nova cliente
              </button>
            )}
          </>
        }
      />
      {actionError && <Banner>{actionError}</Banner>}
      {adding && (
        <NewContact
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}

      <div className="board-tools">
        <label className="search board-tools__search">
          <span className="sr-only">Buscar cliente no quadro</span>
          <input
            type="search"
            placeholder="Buscar por nome ou telefone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <p className="board-tools__total">
          <span className="muted small">Em andamento</span>
          <strong>{funnel.reduce((n, s) => n + s.deals.length, 0)} clientes</strong>
        </p>
        <p className="board-tools__total" title="Soma do preço dos próximos horários marcados">
          <span className="muted small">Previsto nos próximos horários</span>
          <strong>{money(openValue)}</strong>
        </p>
        <div className="segmented segmented--icons" role="group" aria-label="Como ver">
          <button
            type="button"
            aria-pressed={view === 'quadro'}
            className={view === 'quadro' ? 'on' : ''}
            onClick={() => pickView('quadro')}
          >
            <Columns3 aria-hidden="true" size={16} /> Quadro
          </button>
          <button
            type="button"
            aria-pressed={view === 'lista'}
            className={view === 'lista' ? 'on' : ''}
            onClick={() => pickView('lista')}
          >
            <List aria-hidden="true" size={16} /> Lista
          </button>
        </div>
      </div>

      {view === 'lista' ? (
        <DealList
          rows={all}
          stages={data.stages}
          timeZone={data.timeZone}
          searching={Boolean(term)}
          go={go}
          onMove={(dealId, stageId) => void move(dealId, stageId)}
        />
      ) : (
        <>
          <nav className="stage-chips" aria-label="Ir para a etapa">
            {stagesShown.map((s) => (
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
      )}
    </>
  );
}

const VIEW_KEY = 'nexo-etapas-visao';

/** Quadro ou lista: preferência só deste aparelho. */
function readView(): 'quadro' | 'lista' {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'quadro';
  } catch {
    return 'quadro';
  }
}

function saveView(v: 'quadro' | 'lista') {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    // sem armazenamento: vale até fechar a página
  }
}

/** Soma do preço dos próximos horários da etapa (serviço sem preço não entra). */
export function stageValue(stage: PipelineStage): number {
  return stage.deals.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
}

/** Lista: uma linha por cliente, com a etapa num seletor para mudar sem abrir o quadro. */
function DealList({
  rows,
  stages,
  timeZone,
  searching,
  go,
  onMove,
}: {
  rows: { deal: PipelineDeal; stage: PipelineStage }[];
  stages: PipelineStage[];
  timeZone: string;
  searching: boolean;
  go: (to: string) => void;
  onMove: (dealId: string, stageId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="card muted">
        {searching
          ? 'Ninguém com esse nome ou telefone no quadro.'
          : 'Quem escrever pelo WhatsApp ou for cadastrada aqui aparece nesta lista.'}
      </p>
    );
  }
  return (
    <ul className="deal-list" aria-label="Clientes no quadro">
      {rows.map(({ deal, stage }) => {
        const name = contactName(deal.contact);
        return (
          <li key={deal.id} className="deal-list__row card">
            <div className="deal-list__who">
              <button
                type="button"
                className="link"
                onClick={() => go(`/clientes/${deal.contact.id}`)}
              >
                {name}
              </button>
              <span className="muted small">{phone(deal.contact.phone)}</span>
            </div>
            <div className="deal-list__info muted small">
              <span>{sinceLabel(deal.since)}</span>
              {deal.nextAt && (
                <span>
                  Próximo: {nextLabel(deal.nextAt, timeZone)}
                  {deal.nextService ? ` · ${deal.nextService}` : ''}
                </span>
              )}
              {deal.valueCents != null && <strong>{money(deal.valueCents)}</strong>}
            </div>
            <label className="deal-list__stage">
              <span className="sr-only">Etapa de {name}</span>
              <select value={stage.id} onChange={(e) => onMove(deal.id, e.target.value)}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        );
      })}
    </ul>
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
        {deal.valueCents != null && (
          <span className="deal__value">
            {deal.nextService ? `${deal.nextService} · ` : ''}
            {money(deal.valueCents)}
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
