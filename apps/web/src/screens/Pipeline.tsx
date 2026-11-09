import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Clock3,
  Columns3,
  Download,
  LineChart,
  List,
  Megaphone,
  MoreHorizontal,
  SquareKanban,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { type DragEvent, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, money, phone } from '../lib/format';
import { NewContact } from './Contacts';
import { useLoad, useRealtime } from '../lib/hooks';
import { isDemo } from '../lib/demo/mode';
import type { Pipeline as PipelineData, PipelineDeal, PipelineStage } from '../lib/types';
import {
  CampaignsPanel,
  CrmBar,
  type CrmContext,
  CrmFilters,
  type CrmFilter,
  CrmTotals,
  DealPanel,
  FieldsPanel,
  ForecastPanel,
  FunnelEditor,
  matchFilter,
  NewDeal,
  NO_FILTER,
  TASK_KIND_LABEL,
  TasksView,
  loadCrmRefs,
} from './CrmPremium';

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
export function Pipeline({ go, crm }: { go: (to: string) => void; crm?: CrmContext }) {
  // Premium: vários funis; o escolhido fica lembrado neste aparelho.
  const [pipelineId, setPipelineId] = useState<string | null>(() => (crm ? readPipeline() : null));
  const { data, error, loading, reload } = useLoad(
    () => api<PipelineData>('/panel/pipeline', pipelineId ? { query: { pipelineId } } : undefined),
    `pipeline-${pipelineId ?? 'padrao'}`,
  );
  const refs = useLoad(async () => (crm ? loadCrmRefs() : null), crm ? 'crm-refs' : 'crm-refs-off');
  const [actionError, setActionError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [view, setView] = useState<'quadro' | 'lista'>(readView);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'funil' | 'tarefas'>('funil');
  const [filter, setFilter] = useState<CrmFilter>(NO_FILTER);
  const [panel, setPanel] = useState<
    'novo' | 'previsao' | 'funil-novo' | 'funil' | 'campanhas' | 'campos' | null
  >(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  useRealtime(() => {
    void reload();
    if (crm) void refs.reload();
  });

  function pickPipeline(id: string | null) {
    setPipelineId(id);
    savePipeline(id);
    setFilter(NO_FILTER);
  }

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
  if (error && !data) {
    // Funil lembrado que não existe mais: oferece voltar para o principal.
    return (
      <>
        <Banner>{error}</Banner>
        {pipelineId && (
          <button type="button" className="button" onClick={() => pickPipeline(null)}>
            Ver o funil principal
          </button>
        )}
      </>
    );
  }
  if (!data) return null;
  const crmRefsData = crm ? refs.data : null;

  // Busca por nome ou telefone: filtra os cartões, as colunas continuam todas.
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const match = (d: PipelineDeal) =>
    (!crm || matchFilter(d, filter, crm.userId)) &&
    (!term ||
      (d.contact.name ?? '').toLowerCase().includes(term) ||
      (d.title ?? '').toLowerCase().includes(term) ||
      (digits.length > 0 && d.contact.phone.includes(digits)));
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
              premium={Boolean(crm)}
              onOpen={() => (crm ? setOpenDealId(deal.id) : go(`/clientes/${deal.contact.id}`))}
              onMove={(stageId) => void move(deal.id, stageId)}
            />
          ))}
        </ul>
      )}
    </section>
  );

  const allDeals = data.stages.flatMap((s) => s.deals);
  const openDeal = openDealId ? allDeals.find((d) => d.id === openDealId) : undefined;
  const tags = [...new Set(allDeals.flatMap((d) => d.contact.tags ?? []))].sort();
  const currentPipeline = crmRefsData?.pipelines.find((p) => p.id === data.id) ?? null;
  const reloadAll = () => {
    void reload();
    void refs.reload();
  };

  if (crm && mode === 'tarefas') {
    return (
      <>
        <PageHeader
          Icon={SquareKanban}
          title="Etapas"
          subtitle="Ligar, retornar, marcar reunião: o que cada pessoa da equipe tem para fazer."
          actions={<ModeSwitch mode={mode} onMode={setMode} />}
        />
        <TasksView ctx={crm} people={crmRefsData?.people ?? []} timeZone={data.timeZone} go={go} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        Icon={SquareKanban}
        title="Etapas"
        subtitle={
          crm
            ? 'Cada atendimento, do primeiro contato até fechar. Funis, campanhas e tarefas da equipe num lugar só.'
            : 'Cada cliente, do primeiro contato até voltar. O robô move sozinho; você pode mudar a qualquer momento.'
        }
        actions={
          crm ? (
            <>
              <ModeSwitch mode={mode} onMode={setMode} />
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setPanel('previsao')}
              >
                <LineChart aria-hidden="true" size={16} /> Previsão
              </button>
              {crm.canExport && !isDemo() && (
                <a
                  className="button button--ghost"
                  href={`/api/panel/crm/export.csv?pipelineId=${data.id}`}
                  download
                >
                  <Download aria-hidden="true" size={16} /> Exportar
                </a>
              )}
              {data.isDefault && crm.canSettings && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => go('/regras')}
                >
                  Regras automáticas
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={!crmRefsData}
                onClick={() => setPanel('novo')}
              >
                Novo atendimento
              </button>
            </>
          ) : (
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
          )
        }
      />
      {actionError && <Banner>{actionError}</Banner>}
      {crm && refs.error && !crmRefsData && <Banner>{refs.error}</Banner>}
      {crm && crmRefsData && (
        <>
          <CrmBar
            refs={crmRefsData}
            pipelineId={data.id}
            onPick={(id) => pickPipeline(id)}
            ctx={crm}
            onPanel={setPanel}
          />
          {data.forecast && <CrmTotals forecast={data.forecast} />}
        </>
      )}
      {crm && crmRefsData && panel === 'novo' && (
        <NewDeal
          refs={crmRefsData}
          pipelineId={data.id}
          userId={crm.userId}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            reloadAll();
          }}
        />
      )}
      {crm && panel === 'previsao' && data.forecast && (
        <ForecastPanel forecast={data.forecast} onClose={() => setPanel(null)} />
      )}
      {crm && crmRefsData && (panel === 'funil' || panel === 'funil-novo') && (
        <FunnelEditor
          pipeline={panel === 'funil' ? currentPipeline : null}
          onClose={() => setPanel(null)}
          onSaved={(id) => {
            setPanel(null);
            if (id !== data.id) pickPipeline(id);
            reloadAll();
          }}
        />
      )}
      {crm && crmRefsData && panel === 'campanhas' && (
        <CampaignsPanel
          refs={crmRefsData}
          canSettings={crm.canSettings}
          onClose={() => setPanel(null)}
          onChanged={reloadAll}
        />
      )}
      {crm && crmRefsData && panel === 'campos' && (
        <FieldsPanel
          fields={crmRefsData.fields}
          onClose={() => setPanel(null)}
          onChanged={reloadAll}
        />
      )}
      {crm && crmRefsData && openDeal && (
        <DealPanel
          key={openDeal.id}
          deal={openDeal}
          refs={crmRefsData}
          onClose={() => setOpenDealId(null)}
          onSaved={reloadAll}
          go={go}
        />
      )}
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
        {crm && crmRefsData && (
          <CrmFilters
            filter={filter}
            onChange={setFilter}
            tags={tags}
            campaigns={crmRefsData.campaigns}
            canMine={Boolean(crm.userId)}
          />
        )}
        {!crm && (
          <>
            <p className="board-tools__total">
              <span className="muted small">Em andamento</span>
              <strong>{funnel.reduce((n, s) => n + s.deals.length, 0)} clientes</strong>
            </p>
            <p className="board-tools__total" title="Soma do preço dos próximos horários marcados">
              <span className="muted small">Previsto nos próximos horários</span>
              <strong>{money(openValue)}</strong>
            </p>
          </>
        )}
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
          searching={Boolean(term) || (crm ? filter !== NO_FILTER : false)}
          go={go}
          onOpen={crm ? (deal) => setOpenDealId(deal.id) : undefined}
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

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: 'funil' | 'tarefas';
  onMode: (m: 'funil' | 'tarefas') => void;
}) {
  return (
    <div className="segmented segmented--icons" role="group" aria-label="O que ver">
      <button
        type="button"
        aria-pressed={mode === 'funil'}
        className={mode === 'funil' ? 'on' : ''}
        onClick={() => onMode('funil')}
      >
        <SquareKanban aria-hidden="true" size={16} /> Funil
      </button>
      <button
        type="button"
        aria-pressed={mode === 'tarefas'}
        className={mode === 'tarefas' ? 'on' : ''}
        onClick={() => onMode('tarefas')}
      >
        <ClipboardList aria-hidden="true" size={16} /> Minhas tarefas
      </button>
    </div>
  );
}

const PIPELINE_KEY = 'nexo-crm-funil';

function readPipeline(): string | null {
  try {
    return window.localStorage.getItem(PIPELINE_KEY);
  } catch {
    return null;
  }
}

function savePipeline(id: string | null) {
  try {
    if (id) window.localStorage.setItem(PIPELINE_KEY, id);
    else window.localStorage.removeItem(PIPELINE_KEY);
  } catch {
    // sem armazenamento: vale até fechar a página
  }
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
  onOpen,
  onMove,
}: {
  rows: { deal: PipelineDeal; stage: PipelineStage }[];
  stages: PipelineStage[];
  timeZone: string;
  searching: boolean;
  go: (to: string) => void;
  /** Premium: abre o atendimento (valor, responsável, campos) em vez da ficha. */
  onOpen?: (deal: PipelineDeal) => void;
  onMove: (dealId: string, stageId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="card muted">
        {searching
          ? 'Ninguém com esse nome, telefone ou filtro no quadro.'
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
                onClick={() => (onOpen ? onOpen(deal) : go(`/clientes/${deal.contact.id}`))}
              >
                {deal.title ? `${deal.title} · ${name}` : name}
              </button>
              <span className="muted small">
                {phone(deal.contact.phone)}
                {deal.owner ? ` · ${deal.owner.name}` : ''}
              </span>
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
  premium = false,
  onOpen,
  onMove,
}: {
  deal: PipelineDeal;
  stage: PipelineStage;
  next: PipelineStage | null;
  stages: PipelineStage[];
  timeZone: string;
  premium?: boolean;
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
        {premium && deal.title ? deal.title : name}
      </button>
      {premium && deal.title && <p className="deal__sub">{name}</p>}
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
        {premium && deal.nextTask && (
          <span>
            <ClipboardList aria-hidden="true" size={14} />{' '}
            {TASK_KIND_LABEL[deal.nextTask.kind] ?? 'A fazer'}: {deal.nextTask.title}
          </span>
        )}
      </p>
      {premium && (deal.owner || deal.campaign) && (
        <p className="deal__tags">
          {deal.owner && (
            <span className="deal__owner" title={`Responsável: ${deal.owner.name}`}>
              <UserRound aria-hidden="true" size={13} /> {deal.owner.name}
            </span>
          )}
          {deal.campaign && (
            <span className="deal__campaign">
              <Megaphone aria-hidden="true" size={13} /> {deal.campaign.name}
            </span>
          )}
        </p>
      )}
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
