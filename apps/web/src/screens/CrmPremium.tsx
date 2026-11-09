import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Check,
  Megaphone,
  Phone,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, money, phone } from '../lib/format';
import { useLoad } from '../lib/hooks';
import type {
  Campaign,
  CrmPipeline,
  CrmTask,
  CustomField,
  Forecast,
  Person,
  PipelineDeal,
  TaskKind,
} from '../lib/types';

/** O que a tela do CRM completo precisa saber de quem está usando. */
export interface CrmContext {
  userId: string | null;
  /** Dono: vê também as tarefas sem responsável. */
  owner: boolean;
  /** Área Configurações: mexer em funis, campanhas e campos. */
  canSettings: boolean;
  /** Área Privacidade: exportar a planilha (tem telefone). */
  canExport: boolean;
}

export interface CrmRefs {
  pipelines: CrmPipeline[];
  campaigns: Campaign[];
  fields: CustomField[];
  people: Person[];
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  todo: 'A fazer',
  call: 'Ligar',
  follow_up: 'Retorno',
  meeting: 'Reunião',
};

export const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PANEL: 'Cadastrada no painel',
  PUBLIC_LINK: 'Link de agendamento',
  IMPORT: 'Importada',
};

const KIND_LABEL = { OPEN: 'Em andamento', WON: 'Fechou', LOST: 'Não seguiu' } as const;

/** Funis, campanhas, campos e equipe: o que as listas de escolha do CRM usam. */
export async function loadCrmRefs(): Promise<CrmRefs> {
  const [pipelines, campaigns, fields, people] = await Promise.all([
    api<CrmPipeline[]>('/panel/crm/pipelines'),
    api<Campaign[]>('/panel/crm/campaigns'),
    api<CustomField[]>('/panel/crm/fields'),
    api<Person[]>('/panel/crm/people'),
  ]);
  return { pipelines, campaigns, fields, people };
}

/** "1.234,56", "150" ou "150,5" em centavos. Vazio: nulo. Texto que não é valor: NaN. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[R$\s]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

const centsText = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

function errorText(e: unknown, fallback = 'Não foi possível salvar.') {
  return e instanceof ApiError ? e.message : fallback;
}

export function monthLabel(month: string | null): string {
  if (!month) return 'Sem previsão';
  const [y, m] = month.split('-').map(Number);
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, m! - 1, 1)),
  );
  return `${name} de ${y}`;
}

// ---------- Filtros ----------

export interface CrmFilter {
  origin: string;
  tag: string;
  campaignId: string;
  mine: boolean;
}

export const NO_FILTER: CrmFilter = { origin: '', tag: '', campaignId: '', mine: false };

export function matchFilter(deal: PipelineDeal, f: CrmFilter, userId: string | null): boolean {
  if (f.origin && deal.contact.source !== f.origin) return false;
  if (f.tag && !(deal.contact.tags ?? []).includes(f.tag)) return false;
  if (f.campaignId && deal.campaign?.id !== f.campaignId) return false;
  if (f.mine && (!userId || deal.owner?.id !== userId)) return false;
  return true;
}

export function CrmFilters({
  filter,
  onChange,
  tags,
  campaigns,
  canMine,
}: {
  filter: CrmFilter;
  onChange: (f: CrmFilter) => void;
  tags: string[];
  campaigns: Campaign[];
  canMine: boolean;
}) {
  const set = (patch: Partial<CrmFilter>) => onChange({ ...filter, ...patch });
  return (
    <div className="crm-filters" role="group" aria-label="Filtros do quadro">
      <label>
        <span className="sr-only">Origem</span>
        <select value={filter.origin} onChange={(e) => set({ origin: e.target.value })}>
          <option value="">Todas as origens</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Etiqueta</span>
        <select value={filter.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">Todas as etiquetas</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Campanha</span>
        <select value={filter.campaignId} onChange={(e) => set({ campaignId: e.target.value })}>
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {canMine && (
        <button
          type="button"
          className={filter.mine ? 'chip chip--on' : 'chip'}
          aria-pressed={filter.mine}
          onClick={() => set({ mine: !filter.mine })}
        >
          Meus atendimentos
        </button>
      )}
    </div>
  );
}

// ---------- Totais e previsão ----------

export function CrmTotals({ forecast }: { forecast: Forecast }) {
  return (
    <ul className="crm-totals" aria-label="Resumo do funil">
      <li>
        <span className="muted small">Em aberto</span>
        <strong>{money(forecast.openCents)}</strong>
      </li>
      <li title="Cada valor vezes a chance da etapa">
        <span className="muted small">Previsão</span>
        <strong>{money(forecast.weightedCents)}</strong>
      </li>
      <li>
        <span className="muted small">Atendimentos</span>
        <strong>{forecast.count}</strong>
      </li>
    </ul>
  );
}

export function ForecastPanel({ forecast, onClose }: { forecast: Forecast; onClose: () => void }) {
  return (
    <Sheet title="Previsão de fechamento" onClose={onClose}>
      <p className="muted">
        Soma dos atendimentos em andamento pelo mês em que devem fechar. A previsão pesa cada valor
        pela chance da etapa (a chance você muda em Editar funil).
      </p>
      {forecast.byMonth.length === 0 ? (
        <p className="muted">Quando um atendimento tiver valor, ele aparece aqui.</p>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Atendimentos</th>
              <th scope="col">Em aberto</th>
              <th scope="col">Previsão</th>
            </tr>
          </thead>
          <tbody>
            {forecast.byMonth.map((b) => (
              <tr key={b.month ?? 'sem'}>
                <th scope="row">{monthLabel(b.month)}</th>
                <td>{b.count}</td>
                <td>{money(b.openCents)}</td>
                <td>{money(b.weightedCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{forecast.count}</td>
              <td>{money(forecast.openCents)}</td>
              <td>{money(forecast.weightedCents)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Sheet>
  );
}

// ---------- Barra do funil ----------

export function CrmBar({
  refs,
  pipelineId,
  onPick,
  ctx,
  onPanel,
}: {
  refs: CrmRefs;
  pipelineId: string;
  onPick: (id: string) => void;
  ctx: CrmContext;
  onPanel: (panel: 'funil-novo' | 'funil' | 'campanhas' | 'campos') => void;
}) {
  const current = refs.pipelines.find((p) => p.id === pipelineId);
  return (
    <div className="crm-bar">
      <label className="crm-bar__pick">
        <span className="muted small">Funil</span>
        <select value={pipelineId} onChange={(e) => onPick(e.target.value)}>
          {refs.pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? ' (principal)' : ''}
            </option>
          ))}
        </select>
      </label>
      {current?.isDefault && <span className="crm-badge">Principal</span>}
      <div className="crm-bar__actions">
        {ctx.canSettings && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => onPanel('funil-novo')}
          >
            <Plus aria-hidden="true" size={16} /> Novo funil
          </button>
        )}
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => onPanel('campanhas')}
        >
          <Megaphone aria-hidden="true" size={16} /> Campanhas
        </button>
        {ctx.canSettings && (
          <>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => onPanel('campos')}
            >
              <SlidersHorizontal aria-hidden="true" size={16} /> Campos
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => onPanel('funil')}
            >
              <Settings2 aria-hidden="true" size={16} /> Editar funil
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Campos próprios (entrada) ----------

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {field.label}
      {field.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Sem resposta</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'date' ? 'date' : 'text'}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          value={value}
          maxLength={200}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

/** Campos do atendimento que valem para o novo e para a edição. */
interface DealForm {
  title: string;
  value: string;
  ownerUserId: string;
  campaignId: string;
  expectedCloseOn: string;
  fields: Record<string, string>;
}

function dealPayload(form: DealForm, fields: CustomField[]) {
  const valueCents = parseMoney(form.value);
  if (Number.isNaN(valueCents)) throw new ApiError(400, 'Valor: use só números, como 150,00.');
  return {
    title: form.title.trim() || null,
    valueCents,
    ownerUserId: form.ownerUserId || null,
    campaignId: form.campaignId || null,
    expectedCloseOn: form.expectedCloseOn || null,
    fields: Object.fromEntries(
      fields.map((f) => {
        const raw = form.fields[f.id] ?? '';
        return [f.id, raw === '' ? null : raw];
      }),
    ),
  };
}

function DealFields({
  form,
  set,
  refs,
}: {
  form: DealForm;
  set: (patch: Partial<DealForm>) => void;
  refs: CrmRefs;
}) {
  return (
    <>
      <label>
        Nome do atendimento (opcional)
        <input
          value={form.title}
          maxLength={80}
          placeholder="Ex.: Pacote de noiva"
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <div className="form__pair">
        <label>
          Valor (R$)
          <input
            inputMode="decimal"
            value={form.value}
            placeholder="0,00"
            onChange={(e) => set({ value: e.target.value })}
          />
        </label>
        <label>
          Previsão de fechamento
          <input
            type="date"
            value={form.expectedCloseOn}
            onChange={(e) => set({ expectedCloseOn: e.target.value })}
          />
        </label>
      </div>
      <div className="form__pair">
        <label>
          Responsável
          <select value={form.ownerUserId} onChange={(e) => set({ ownerUserId: e.target.value })}>
            <option value="">Sem responsável</option>
            {refs.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Campanha
          <select value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })}>
            <option value="">Nenhuma</option>
            {refs.campaigns
              .filter((c) => !c.archivedAt || c.id === form.campaignId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {refs.fields.map((f) => (
        <FieldInput
          key={f.id}
          field={f}
          value={form.fields[f.id] ?? ''}
          onChange={(v) => set({ fields: { ...form.fields, [f.id]: v } })}
        />
      ))}
    </>
  );
}

// ---------- Novo atendimento ----------

export function NewDeal({
  refs,
  pipelineId,
  userId,
  onDone,
  onClose,
}: {
  refs: CrmRefs;
  pipelineId: string;
  userId: string | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const pipeline = refs.pipelines.find((p) => p.id === pipelineId);
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [stageId, setStageId] = useState(pipeline?.stages[0]?.id ?? '');
  const [form, setForm] = useState<DealForm>({
    title: '',
    value: '',
    ownerUserId: userId ?? '',
    campaignId: '',
    expectedCloseOn: '',
    fields: {},
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const digits = tel.replace(/\D/g, '');
      await api('/panel/crm/deals', {
        method: 'POST',
        body: {
          name,
          phone: digits.length <= 11 ? `55${digits}` : digits,
          pipelineId,
          stageId: stageId || undefined,
          ...dealPayload(form, refs.fields),
        },
      });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Novo atendimento" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          Se o telefone já for de uma cliente, o atendimento entra na ficha dela.
        </p>
        <label>
          Nome da cliente
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label>
          Telefone com DDD
          <input
            inputMode="tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="(15) 99999-0000"
            required
          />
        </label>
        <label>
          Etapa
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {pipeline?.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <DealFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} refs={refs} />
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button" disabled={saving}>
            Salvar atendimento
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Voltar
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Atendimento (editar) ----------

export function DealPanel({
  deal,
  refs,
  onClose,
  onSaved,
  go,
}: {
  deal: PipelineDeal;
  refs: CrmRefs;
  onClose: () => void;
  onSaved: () => void;
  go: (to: string) => void;
}) {
  const [form, setForm] = useState<DealForm>({
    title: deal.title ?? '',
    value: deal.ownValue ? centsText(deal.valueCents) : '',
    ownerUserId: deal.owner?.id ?? '',
    campaignId: deal.campaign?.id ?? '',
    expectedCloseOn: deal.expectedCloseOn ?? '',
    fields: Object.fromEntries(Object.entries(deal.fields ?? {}).map(([k, v]) => [k, String(v)])),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const name = contactName(deal.contact);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await api(`/panel/crm/deals/${deal.id}`, {
        method: 'PUT',
        body: dealPayload(form, refs.fields),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Sheet title={deal.title || name} onClose={onClose}>
      <p className="crm-deal__who">
        <button type="button" className="link" onClick={() => go(`/clientes/${deal.contact.id}`)}>
          Abrir a ficha de {name}
        </button>
        <span className="muted small">{phone(deal.contact.phone)}</span>
      </p>
      {!deal.ownValue && deal.valueCents != null && (
        <p className="muted small">
          Sem valor escrito, o quadro usa o preço do próximo horário ({money(deal.valueCents)}).
        </p>
      )}
      <form className="form" onSubmit={submit}>
        <DealFields form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} refs={refs} />
        {error && <Banner>{error}</Banner>}
        {saved && <Banner kind="ok">Atendimento salvo.</Banner>}
        <div className="row">
          <button type="submit" className="button">
            Salvar
          </button>
        </div>
      </form>
      <hr className="crm-sep" />
      <NewTask
        people={refs.people}
        dealId={deal.id}
        defaultAssignee={deal.owner?.id ?? ''}
        onDone={onSaved}
      />
    </Sheet>
  );
}

// ---------- Tarefas ----------

function NewTask({
  people,
  dealId,
  defaultAssignee,
  onDone,
}: {
  people: Person[];
  dealId?: string;
  defaultAssignee: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('call');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOk(false);
    try {
      await api('/panel/crm/tasks', {
        method: 'POST',
        body: {
          title,
          kind,
          dueAt: due ? new Date(due).toISOString() : null,
          dealId,
          assigneeUserId: assignee || null,
        },
      });
      setTitle('');
      setDue('');
      setOk(true);
      onDone();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <form className="form" onSubmit={submit} aria-label="Nova tarefa">
      <h3>Nova tarefa</h3>
      <label>
        O que fazer
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          placeholder="Ex.: Ligar para confirmar"
        />
      </label>
      <div className="form__pair">
        <label>
          Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            {Object.entries(TASK_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quando
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <label>
        Para quem
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Sem responsável</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && <Banner>{error}</Banner>}
      {ok && <Banner kind="ok">Tarefa criada.</Banner>}
      <div className="row">
        <button type="submit" className="button button--ghost">
          <Plus aria-hidden="true" size={16} /> Criar tarefa
        </button>
      </div>
    </form>
  );
}

const KIND_ICON = { todo: Check, call: Phone, follow_up: RotateCcw, meeting: Users } as const;

type Group = 'late' | 'today' | 'next' | 'none';
const GROUP_LABEL: Record<Group, string> = {
  late: 'Atrasadas',
  today: 'Hoje',
  next: 'Próximas',
  none: 'Sem data',
};

function groupOf(dueAt: string | null, now: Date, timeZone: string): Group {
  if (!dueAt) return 'none';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const due = new Date(dueAt);
  if (day(due) === day(now)) return due < now ? 'late' : 'today';
  return due < now ? 'late' : 'next';
}

/** Minhas tarefas: ligar, retornar, reunião. Atrasadas primeiro. */
export function TasksView({
  ctx,
  people,
  timeZone,
  go,
}: {
  ctx: CrmContext;
  people: Person[];
  timeZone: string;
  go: (to: string) => void;
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [done, setDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () =>
      api<CrmTask[]>('/panel/crm/tasks', {
        query: { scope, done: String(done) },
      }),
    `tarefas-${scope}-${done}`,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggle(task: CrmTask) {
    setActionError(null);
    try {
      await api(
        task.doneAt ? `/panel/crm/tasks/${task.id}/reopen` : `/panel/tasks/${task.id}/done`,
        {
          method: 'POST',
        },
      );
      await reload();
    } catch (e) {
      setActionError(errorText(e, 'Não foi possível mudar a tarefa.'));
    }
  }

  const now = new Date();
  const groups: Group[] = ['late', 'today', 'next', 'none'];
  const when = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(new Date(iso));

  const row = (task: CrmTask) => {
    const Icon = KIND_ICON[task.kind] ?? Check;
    return (
      <li key={task.id} className={task.doneAt ? 'task task--done' : 'task'}>
        <button
          type="button"
          className="task__check"
          aria-label={task.doneAt ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
          aria-pressed={Boolean(task.doneAt)}
          onClick={() => void toggle(task)}
        >
          {task.doneAt && <Check aria-hidden="true" size={16} />}
        </button>
        <div className="task__body">
          <p className="task__title">{task.title}</p>
          <p className="muted small task__meta">
            <span>
              <Icon aria-hidden="true" size={14} /> {TASK_KIND_LABEL[task.kind] ?? 'A fazer'}
            </span>
            {task.dueAt && <span>{when(task.dueAt)}</span>}
            {task.contact && (
              <button
                type="button"
                className="link"
                onClick={() => go(`/clientes/${task.contact!.id}`)}
              >
                {contactName(task.contact)}
              </button>
            )}
            {scope === 'all' && <span>{task.assignee?.name ?? 'Sem responsável'}</span>}
          </p>
        </div>
      </li>
    );
  };

  return (
    <section aria-label="Tarefas">
      <div className="crm-tasks__tools">
        <div className="segmented" role="group" aria-label="De quem">
          <button
            type="button"
            aria-pressed={scope === 'mine'}
            className={scope === 'mine' ? 'on' : ''}
            onClick={() => setScope('mine')}
          >
            Minhas
          </button>
          <button
            type="button"
            aria-pressed={scope === 'all'}
            className={scope === 'all' ? 'on' : ''}
            onClick={() => setScope('all')}
          >
            Da equipe
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Situação">
          <button
            type="button"
            aria-pressed={!done}
            className={!done ? 'on' : ''}
            onClick={() => setDone(false)}
          >
            Abertas
          </button>
          <button
            type="button"
            aria-pressed={done}
            className={done ? 'on' : ''}
            onClick={() => setDone(true)}
          >
            Feitas
          </button>
        </div>
        <button type="button" className="button" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={16} /> Nova tarefa
        </button>
      </div>
      {adding && (
        <Sheet title="Nova tarefa" onClose={() => setAdding(false)}>
          <NewTask
            people={people}
            defaultAssignee={ctx.userId ?? ''}
            onDone={() => void reload()}
          />
        </Sheet>
      )}
      {actionError && <Banner>{actionError}</Banner>}
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Banner>{error}</Banner>
      ) : !data || data.length === 0 ? (
        <Empty
          title={done ? 'Nenhuma tarefa feita ainda' : 'Nada para fazer agora'}
          icon={<CalendarCheck size={22} />}
        >
          {done
            ? 'O que for concluído aparece aqui, para desfazer se precisar.'
            : 'Crie uma tarefa para ligar, retornar ou marcar uma reunião. As que o sistema cria sozinho (como chamar quem faltou) também aparecem aqui.'}
        </Empty>
      ) : done ? (
        <ul className="tasks card">{data.map(row)}</ul>
      ) : (
        groups.map((g) => {
          const items = data.filter((t) => groupOf(t.dueAt, now, timeZone) === g);
          if (items.length === 0) return null;
          return (
            <section
              key={g}
              className={`tasks-group tasks-group--${g}`}
              aria-label={GROUP_LABEL[g]}
            >
              <h3>
                {GROUP_LABEL[g]} <span className="count">{items.length}</span>
              </h3>
              <ul className="tasks card">{items.map(row)}</ul>
            </section>
          );
        })
      )}
    </section>
  );
}

// ---------- Editar funil ----------

interface StageDraft {
  id?: string;
  name: string;
  kind: 'OPEN' | 'WON' | 'LOST';
  probability: string;
}

export function FunnelEditor({
  pipeline,
  onClose,
  onSaved,
}: {
  /** Nulo: funil novo (nasce com o modelo padrão). */
  pipeline: CrmPipeline | null;
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const [name, setName] = useState(pipeline?.name ?? '');
  const [stages, setStages] = useState<StageDraft[]>(
    () =>
      pipeline?.stages.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        probability: s.probability == null ? '' : String(s.probability),
      })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const setStage = (i: number, patch: Partial<StageDraft>) =>
    setStages((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStage = (i: number, by: number) =>
    setStages((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (!pipeline) {
        const created = await api<{ id: string }>('/panel/crm/pipelines', {
          method: 'POST',
          body: { name },
        });
        onSaved(created.id);
        return;
      }
      await api(`/panel/crm/pipelines/${pipeline.id}`, {
        method: 'PUT',
        body: {
          name,
          stages: stages.map((s) => ({
            ...(s.id ? { id: s.id } : {}),
            name: s.name,
            kind: s.kind,
            probability: s.probability === '' ? null : Number(s.probability),
          })),
        },
      });
      onSaved(pipeline.id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!pipeline) return;
    setError(null);
    try {
      await api(`/panel/crm/pipelines/${pipeline.id}`, { method: 'DELETE' });
      onSaved(null);
    } catch (e) {
      setError(errorText(e, 'Não foi possível apagar.'));
    }
  }

  return (
    <Sheet title={pipeline ? 'Editar funil' : 'Novo funil'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome do funil
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        {!pipeline ? (
          <p className="muted small">
            O funil nasce com as etapas Novo contato, Qualificado, Orçamento, Negociação, Fechado e
            Perdido. Depois você renomeia, muda a ordem e acrescenta etapas.
          </p>
        ) : (
          <fieldset className="funnel-stages">
            <legend>Etapas</legend>
            <p className="muted small">
              Chance é quanto um atendimento nesta etapa costuma fechar (0 a 100). Ela entra na
              previsão.
            </p>
            <ol>
              {stages.map((s, i) => (
                <li key={s.id ?? `nova-${i}`} className="funnel-stage">
                  <label>
                    <span className="sr-only">Nome da etapa {i + 1}</span>
                    <input
                      value={s.name}
                      maxLength={40}
                      required
                      onChange={(e) => setStage(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="sr-only">Tipo da etapa {s.name}</span>
                    <select
                      value={s.kind}
                      onChange={(e) => setStage(i, { kind: e.target.value as StageDraft['kind'] })}
                    >
                      {Object.entries(KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="funnel-stage__chance">
                    <span className="sr-only">Chance da etapa {s.name}</span>
                    <input
                      inputMode="numeric"
                      value={s.probability}
                      placeholder="%"
                      maxLength={3}
                      onChange={(e) =>
                        setStage(i, { probability: e.target.value.replace(/\D/g, '').slice(0, 3) })
                      }
                    />
                  </label>
                  <div className="funnel-stage__actions">
                    <button
                      type="button"
                      className="icon-button icon-button--plain"
                      aria-label={`Subir ${s.name}`}
                      disabled={i === 0}
                      onClick={() => moveStage(i, -1)}
                    >
                      <ArrowUp aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--plain"
                      aria-label={`Descer ${s.name}`}
                      disabled={i === stages.length - 1}
                      onClick={() => moveStage(i, 1)}
                    >
                      <ArrowDown aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--plain"
                      aria-label={`Tirar ${s.name}`}
                      disabled={stages.length <= 2}
                      onClick={() => setStages((list) => list.filter((_, j) => j !== i))}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={stages.length >= 12}
              onClick={() =>
                setStages((list) => {
                  // Etapa nova entra antes das de saída (Fechou / Não seguiu).
                  const at = list.findIndex((s) => s.kind !== 'OPEN');
                  const next = [...list];
                  next.splice(at === -1 ? list.length : at, 0, {
                    name: 'Nova etapa',
                    kind: 'OPEN',
                    probability: '',
                  });
                  return next;
                })
              }
            >
              <Plus aria-hidden="true" size={16} /> Etapa
            </button>
          </fieldset>
        )}
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button">
            {pipeline ? 'Salvar funil' : 'Criar funil'}
          </button>
          {pipeline && !pipeline.isDefault && (
            <button type="button" className="button button--ghost" onClick={() => void remove()}>
              Apagar funil
            </button>
          )}
        </div>
        {pipeline && !pipeline.isDefault && (
          <p className="muted small">Só dá para apagar um funil que nunca teve atendimento.</p>
        )}
      </form>
    </Sheet>
  );
}

// ---------- Campanhas ----------

export function CampaignsPanel({
  refs,
  canSettings,
  onClose,
  onChanged,
}: {
  refs: CrmRefs;
  canSettings: boolean;
  onClose: () => void;
  onChanged: (pipelineId?: string) => void;
}) {
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function archive(c: Campaign) {
    setError(null);
    try {
      await api(`/panel/crm/campaigns/${c.id}/archive`, {
        method: 'POST',
        body: { archived: !c.archivedAt },
      });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (editing) {
    return (
      <CampaignForm
        refs={refs}
        campaign={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(pipelineId) => {
          setEditing(null);
          onChanged(pipelineId);
        }}
      />
    );
  }

  return (
    <Sheet title="Campanhas" onClose={onClose}>
      <p className="muted">
        Uma campanha junta os atendimentos que vieram de uma ação (uma promoção no Instagram, um
        evento). Cada atendimento pode ficar ligado a uma campanha.
      </p>
      {canSettings && (
        <button type="button" className="button" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" size={16} /> Nova campanha
        </button>
      )}
      {error && <Banner>{error}</Banner>}
      {refs.campaigns.length === 0 ? (
        <p className="muted">Nenhuma campanha ainda.</p>
      ) : (
        <ul className="crm-list">
          {refs.campaigns.map((c) => (
            <li
              key={c.id}
              className={c.archivedAt ? 'card crm-list__item muted' : 'card crm-list__item'}
            >
              <div>
                <p className="crm-list__title">
                  {c.name}
                  {c.archivedAt && <span className="crm-badge">Arquivada</span>}
                </p>
                <p className="muted small">
                  {[
                    c.channel,
                    c.pipeline ? `Funil ${c.pipeline.name}` : null,
                    c.startsOn || c.endsOn
                      ? `${c.startsOn ? shortDay(c.startsOn) : '…'} a ${c.endsOn ? shortDay(c.endsOn) : '…'}`
                      : null,
                    c.budgetCents != null ? `Verba ${money(c.budgetCents)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="small">
                  {c.deals} {c.deals === 1 ? 'atendimento' : 'atendimentos'} · {c.won} fechado
                  {c.won === 1 ? '' : 's'}
                  {c.wonCents > 0 ? ` (${money(c.wonCents)})` : ''}
                </p>
              </div>
              {canSettings && (
                <div className="row">
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setEditing(c)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => void archive(c)}
                  >
                    {c.archivedAt ? 'Voltar a usar' : 'Arquivar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function CampaignForm({
  refs,
  campaign,
  onClose,
  onSaved,
}: {
  refs: CrmRefs;
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: (pipelineId?: string) => void;
}) {
  const [name, setName] = useState(campaign?.name ?? '');
  const [channel, setChannel] = useState(campaign?.channel ?? '');
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? '');
  const [budget, setBudget] = useState(centsText(campaign?.budgetCents));
  const [funnel, setFunnel] = useState<string>(campaign?.pipeline?.id ?? '');
  const [newFunnel, setNewFunnel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const budgetCents = parseMoney(budget);
    if (Number.isNaN(budgetCents)) {
      setError('Verba: use só números, como 300,00.');
      return;
    }
    try {
      const body = {
        name,
        channel: channel.trim() || null,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        budgetCents,
        ...(funnel === 'novo'
          ? { newPipelineName: newFunnel.trim() || name }
          : { pipelineId: funnel || null }),
      };
      if (campaign) {
        await api(`/panel/crm/campaigns/${campaign.id}`, { method: 'PUT', body });
        onSaved();
      } else {
        await api('/panel/crm/campaigns', { method: 'POST', body });
        onSaved();
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Sheet title={campaign ? 'Editar campanha' : 'Nova campanha'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome da campanha
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        <label>
          Por onde (opcional)
          <input
            value={channel}
            maxLength={40}
            placeholder="Ex.: Instagram"
            onChange={(e) => setChannel(e.target.value)}
          />
        </label>
        <div className="form__pair">
          <label>
            Começa
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label>
            Termina
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        </div>
        <label>
          Verba (R$, opcional)
          <input
            inputMode="decimal"
            value={budget}
            placeholder="0,00"
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label>
          Funil da campanha
          <select value={funnel} onChange={(e) => setFunnel(e.target.value)}>
            <option value="">Nenhum em especial</option>
            {refs.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="novo">Criar um funil novo para esta campanha</option>
          </select>
        </label>
        {funnel === 'novo' && (
          <label>
            Nome do funil novo
            <input
              value={newFunnel}
              maxLength={60}
              placeholder={name || 'Mesmo nome da campanha'}
              onChange={(e) => setNewFunnel(e.target.value)}
            />
          </label>
        )}
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button">
            Salvar campanha
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Voltar
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Campos próprios (configurar) ----------

const FIELD_TYPE_LABEL = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  select: 'Lista de opções',
} as const;

export function FieldsPanel({
  fields,
  onClose,
  onChanged,
}: {
  fields: CustomField[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomField['type']>('text');
  const [options, setOptions] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/panel/crm/fields', {
        method: 'POST',
        body: {
          label,
          type,
          options:
            type === 'select'
              ? options
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
              : undefined,
        },
      });
      setLabel('');
      setOptions('');
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(f: CustomField) {
    setError(null);
    try {
      await api(`/panel/crm/fields/${f.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Não foi possível tirar o campo.'));
    }
  }

  return (
    <Sheet title="Campos dos atendimentos" onClose={onClose}>
      <p className="muted">
        Campos que o seu negócio precisa anotar em cada atendimento (ex.: Indicada por, Data do
        evento). Aparecem no cartão e na planilha.
      </p>
      {fields.length > 0 && (
        <ul className="crm-list">
          {fields.map((f) => (
            <li key={f.id} className="card crm-list__item">
              <div>
                <p className="crm-list__title">{f.label}</p>
                <p className="muted small">
                  {FIELD_TYPE_LABEL[f.type]}
                  {f.type === 'select' ? `: ${f.options.join(', ')}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="button button--ghost button--small"
                aria-label={`Tirar o campo ${f.label}`}
                onClick={() => void remove(f)}
              >
                Tirar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="form" onSubmit={submit} aria-label="Novo campo">
        <h3>Novo campo</h3>
        <label>
          Nome do campo
          <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} />
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as CustomField['type'])}>
            {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {type === 'select' && (
          <label>
            Opções, separadas por vírgula
            <input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="Ex.: Casamento, Formatura, Aniversário"
              required
            />
          </label>
        )}
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button">
            Criar campo
          </button>
        </div>
      </form>
    </Sheet>
  );
}
