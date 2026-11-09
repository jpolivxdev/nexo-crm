import { Repeat2, SlidersHorizontal, Upload } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName, money, phone } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';

type Status = 'ok' | 'attention' | 'risk' | 'lost';

interface PortfolioRules {
  attentionDays: number;
  riskDays: number;
  lostDays: number;
}

interface PortfolioClient {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
  optedOutAt: string | null;
  status: Status;
  daysSince: number;
  visits: number;
  totalCents: number;
  avgIntervalDays: number | null;
  lastDoneAt: string;
  nextAt: string | null;
}

interface PortfolioData {
  rules: PortfolioRules;
  summary: Record<Status | 'total' | 'totalCents', number>;
  clients: PortfolioClient[];
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'Em dia',
  attention: 'Atenção',
  risk: 'Em risco',
  lost: 'Perdida',
};

const STATUS_HINT = (r: PortfolioRules): Record<Status, string> => ({
  ok: 'Tem horário marcado ou voltou dentro do costume dela.',
  attention: `Passou do intervalo de costume (ou de ${r.attentionDays} dias, para quem veio uma vez só).`,
  risk: `Mais de ${r.riskDays} dias sem vir. Bom momento para chamar.`,
  lost: `Mais de ${r.lostDays} dias sem vir.`,
});

/**
 * Carteira (Premium): só quem já foi atendida, com a situação da volta. Pior primeiro.
 * As regras (dias) o dono ou o gestor mudam aqui mesmo.
 */
export function Portfolio({ go, canSettings }: { go: (to: string) => void; canSettings: boolean }) {
  const { data, error, loading, reload } = useLoad(
    () => api<PortfolioData>('/panel/crm/portfolio'),
    'carteira',
  );
  const [filter, setFilter] = useState<Status | ''>('');
  const [editing, setEditing] = useState(false);
  useRealtime(
    (n) => (n.type === 'agenda.changed' || n.type === 'contact.updated') && void reload(),
  );

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;

  const shown = filter ? data.clients.filter((c) => c.status === filter) : data.clients;
  const hints = STATUS_HINT(data.rules);

  return (
    <>
      <PageHeader
        Icon={Repeat2}
        title="Carteira"
        subtitle="Quem já foi atendida e como está a volta de cada uma. Quem está em risco vem primeiro."
        actions={
          canSettings && (
            <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
              <SlidersHorizontal aria-hidden="true" size={16} /> Regras
            </button>
          )
        }
      />
      {editing && (
        <RulesSheet
          rules={data.rules}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
      <ul className="crm-totals portfolio-totals" aria-label="Resumo da carteira">
        <li>
          <span className="muted small">Clientes</span>
          <strong>{data.summary.total}</strong>
        </li>
        {(['ok', 'attention', 'risk', 'lost'] as Status[]).map((s) => (
          <li key={s} data-status={s}>
            <span className="muted small">{STATUS_LABEL[s]}</span>
            <strong>{data.summary[s]}</strong>
          </li>
        ))}
        <li>
          <span className="muted small">Já gastaram</span>
          <strong>{money(data.summary.totalCents)}</strong>
        </li>
      </ul>
      <div className="segmented" role="group" aria-label="Situação">
        {(['', 'risk', 'attention', 'lost', 'ok'] as const).map((s) => (
          <button
            key={s || 'todas'}
            type="button"
            className={filter === s ? 'on' : ''}
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
          >
            {s ? STATUS_LABEL[s] : 'Todas'}
          </button>
        ))}
      </div>
      {filter && <p className="muted small">{hints[filter]}</p>}
      {shown.length === 0 ? (
        <Empty
          title={filter ? `Ninguém em "${STATUS_LABEL[filter]}"` : 'Carteira vazia'}
          icon={<Repeat2 size={24} />}
        >
          {filter
            ? 'Bom sinal. Quando alguém entrar nessa situação, aparece aqui.'
            : 'Quando uma cliente for marcada como atendida na agenda, ela entra na carteira.'}
        </Empty>
      ) : (
        <ul className="list portfolio">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="card card--button portfolio__row"
                onClick={() => go(`/clientes/${c.id}`)}
              >
                <strong>{contactName(c)}</strong>
                <span className={`tag portfolio__status portfolio__status--${c.status}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <span className="muted small">
                  {phone(c.phone)} · {c.visits} {c.visits === 1 ? 'atendimento' : 'atendimentos'}
                  {c.totalCents > 0 ? ` · ${money(c.totalCents)}` : ''}
                </span>
                <span className="small">
                  {c.nextAt
                    ? 'Tem horário marcado'
                    : c.daysSince === 0
                      ? 'Veio hoje'
                      : `Última vez há ${c.daysSince} ${c.daysSince === 1 ? 'dia' : 'dias'}`}
                  {c.avgIntervalDays ? ` · costuma voltar a cada ${c.avgIntervalDays} dias` : ''}
                </span>
                {c.optedOutAt && <span className="tag tag--warn">Não quer mensagens</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RulesSheet({
  rules,
  onClose,
  onSaved,
}: {
  rules: PortfolioRules;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    attentionDays: String(rules.attentionDays),
    riskDays: String(rules.riskDays),
    lostDays: String(rules.lostDays),
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/panel/crm/portfolio/rules', {
        method: 'PUT',
        body: {
          attentionDays: Number(form.attentionDays),
          riskDays: Number(form.riskDays),
          lostDays: Number(form.lostDays),
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  const field = (key: keyof typeof form, label: string) => (
    <label>
      {label}
      <input
        inputMode="numeric"
        value={form[key]}
        required
        maxLength={3}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, '') }))}
      />
    </label>
  );

  return (
    <Sheet title="Regras da carteira" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          Quantos dias sem vir (e sem horário marcado) para cada situação. Quem tem costume de
          voltar mais cedo entra em Atenção antes, pelo próprio intervalo.
        </p>
        {field('attentionDays', 'Atenção depois de (dias)')}
        {field('riskDays', 'Em risco depois de (dias)')}
        {field('lostDays', 'Perdida depois de (dias)')}
        {error && <Banner>{error}</Banner>}
        <div className="row">
          <button type="submit" className="button">
            Salvar regras
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Importar clientes ----------

type ImportStatus = 'new' | 'existing' | 'duplicate' | 'invalid';

interface ImportRow {
  line: number;
  name: string;
  phone: string | null;
  tags: string[];
  status: ImportStatus;
  reason?: string;
}

interface ImportCheck {
  rows: ImportRow[];
  summary: Record<ImportStatus | 'total', number>;
}

const IMPORT_LABEL: Record<ImportStatus, string> = {
  new: 'Nova',
  existing: 'Já cadastrada',
  duplicate: 'Repetida',
  invalid: 'Não entra',
};

/** Tamanho que o servidor aceita de uma vez (cerca de 1.500 clientes). */
const MAX_CHARS = 90_000;

/** Importar: escolhe o arquivo, confere linha por linha e só então salva. */
export function ImportContacts({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; skipped: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCheck(null);
    setDone(null);
    setCsv(await file.text());
  }

  async function verify() {
    setError(null);
    setDone(null);
    if (csv.length > MAX_CHARS) {
      setError('Planilha grande demais para uma vez só. Divida em partes de até 1.500 clientes.');
      return;
    }
    setBusy(true);
    try {
      setCheck(
        await api<ImportCheck>('/panel/crm/contacts/import/check', {
          method: 'POST',
          body: { csv },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível conferir.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      setDone(
        await api('/panel/crm/contacts/import', { method: 'POST', body: { csv, updateExisting } }),
      );
      setCheck(null);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível importar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Importar clientes" onClose={onClose}>
      <p className="muted small">
        Planilha em CSV (no Excel ou no Google Planilhas: Salvar como, CSV) com as colunas Nome e
        Telefone; Etiquetas é opcional. Nada é salvo antes de você conferir.
      </p>
      <label className="file-pick">
        <Upload aria-hidden="true" size={16} /> Escolher arquivo
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void readFile(e)} />
      </label>
      <label>
        Ou cole aqui
        <textarea
          rows={5}
          value={csv}
          placeholder={'Nome;Telefone;Etiquetas\nAna;(15) 99999-0000;vip'}
          onChange={(e) => {
            setCsv(e.target.value);
            setCheck(null);
          }}
        />
      </label>
      <div className="row">
        <button
          type="button"
          className="button button--ghost"
          disabled={!csv.trim() || busy}
          onClick={() => void verify()}
        >
          Conferir
        </button>
      </div>
      {error && <Banner>{error}</Banner>}
      {done && (
        <Banner kind="ok">
          Pronto: {done.created} {done.created === 1 ? 'cliente nova' : 'clientes novas'}
          {done.updated > 0 ? `, ${done.updated} com etiquetas novas` : ''}.
        </Banner>
      )}
      {check && (
        <section aria-label="Conferência" className="import-check">
          <ul className="crm-totals">
            {(['new', 'existing', 'duplicate', 'invalid'] as ImportStatus[]).map((s) => (
              <li key={s}>
                <span className="muted small">{IMPORT_LABEL[s]}</span>
                <strong>{check.summary[s]}</strong>
              </li>
            ))}
          </ul>
          <div className="import-check__table">
            <table className="crm-table">
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Nome</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {check.rows.slice(0, 200).map((r) => (
                  <tr key={r.line} data-status={r.status}>
                    <td>{r.line}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.phone ? phone(r.phone) : '—'}</td>
                    <td>
                      {IMPORT_LABEL[r.status]}
                      {r.reason ? `: ${r.reason}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {check.rows.length > 200 && (
              <p className="muted small">
                Mostrando as 200 primeiras de {check.rows.length} linhas.
              </p>
            )}
          </div>
          {check.summary.existing > 0 && (
            <label className="choice">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              Somar as etiquetas da planilha nas clientes que já existem
            </label>
          )}
          <div className="row">
            <button
              type="button"
              className="button"
              disabled={
                busy || (check.summary.new === 0 && !(updateExisting && check.summary.existing > 0))
              }
              onClick={() => void save()}
            >
              Importar {check.summary.new}{' '}
              {check.summary.new === 1 ? 'cliente nova' : 'clientes novas'}
            </button>
          </div>
        </section>
      )}
    </Sheet>
  );
}
