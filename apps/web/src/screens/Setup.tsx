import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SetupData, SetupWindow } from '../lib/types';

const STEPS = ['Negócio', 'Serviços', 'Horários', 'Dúvidas', 'Pronto'] as const;

/** Seg a dom, na ordem em que a dona lê a semana (0 = domingo, como no núcleo). */
const WEEK = [
  { weekday: 1, label: 'Segunda' },
  { weekday: 2, label: 'Terça' },
  { weekday: 3, label: 'Quarta' },
  { weekday: 4, label: 'Quinta' },
  { weekday: 5, label: 'Sexta' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
];

export function toMinute(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function toHhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  return `${String(h).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "150" ou "150,50" → 15050 centavos. Vazio → null (sem preço). */
export function parsePrice(text: string): number | null | 'invalid' {
  const clean = text.trim().replace(/^R\$\s*/, '');
  if (!clean) return null;
  const m = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(clean);
  if (!m) return 'invalid';
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

function formatPrice(cents: number | null): string {
  if (cents === null) return '';
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

interface DayForm {
  open: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
}

/** Até duas janelas por dia: expediente com uma pausa opcional (ex.: almoço). */
export function windowsToDays(windows: SetupWindow[]): Record<number, DayForm> {
  const days: Record<number, DayForm> = {};
  for (const { weekday } of WEEK) {
    const list = windows.filter((w) => w.weekday === weekday);
    const first = list[0];
    const last = list[list.length - 1];
    days[weekday] =
      first && last
        ? {
            open: true,
            start: toHhmm(first.startMinute),
            end: toHhmm(last.endMinute),
            breakStart: list.length > 1 ? toHhmm(first.endMinute) : '',
            breakEnd: list.length > 1 ? toHhmm(list[1]!.startMinute) : '',
          }
        : { open: false, start: '09:00', end: '18:00', breakStart: '', breakEnd: '' };
  }
  return days;
}

export function daysToWindows(days: Record<number, DayForm>): SetupWindow[] | string {
  const windows: SetupWindow[] = [];
  for (const { weekday, label } of WEEK) {
    const d = days[weekday];
    if (!d?.open) continue;
    const start = toMinute(d.start);
    const end = toMinute(d.end);
    if (start === null || end === null || end <= start) {
      return `${label}: o fim do expediente precisa ser depois do início.`;
    }
    if (d.breakStart || d.breakEnd) {
      const bs = toMinute(d.breakStart);
      const be = toMinute(d.breakEnd);
      if (bs === null || be === null || be <= bs || bs <= start || be >= end) {
        return `${label}: a pausa precisa ficar dentro do expediente, com fim depois do início.`;
      }
      windows.push({ weekday, startMinute: start, endMinute: bs });
      windows.push({ weekday, startMinute: be, endMinute: end });
    } else {
      windows.push({ weekday, startMinute: start, endMinute: end });
    }
  }
  return windows;
}

/** Assistente para configurar o negócio em poucos minutos. Cada passo salva ao avançar. */
export function Setup({ go }: { go: (to: string) => void }) {
  const { refresh } = useAuth();
  const [data, setData] = useState<SetupData | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SetupData>('/panel/setup')
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Não foi possível carregar a configuração.'),
      );
  }, []);

  async function save(path: string, body: unknown, method = 'PUT') {
    setBusy(true);
    setError(null);
    try {
      setData(await api<SetupData>(`/panel/setup${path}`, { method, body }));
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next(path: string, body: unknown) {
    if (await save(path, body)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  if (!data) return error ? <Banner>{error}</Banner> : <Loading />;

  return (
    <>
      <header className="page-header">
        <h1>Configurar o negócio</h1>
        <p className="muted">
          Passo {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>
      </header>
      <ol className="steps" aria-label="Passos">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined}>
            <button
              type="button"
              className={i === step ? 'chip chip--on' : 'chip'}
              onClick={() => setStep(i)}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      {error && <Banner>{error}</Banner>}

      {step === 0 && (
        <BusinessStep data={data} busy={busy} onSave={(b) => void next('/business', b)} />
      )}
      {step === 1 && (
        <ServicesStep
          data={data}
          busy={busy}
          onError={setError}
          onSave={(services) => void next('/services', { services })}
        />
      )}
      {step === 2 && (
        <HoursStep
          data={data}
          busy={busy}
          onError={setError}
          onSave={(windows) => void next('/hours', { windows })}
        />
      )}
      {step === 3 && (
        <FaqStep data={data} busy={busy} onSave={(items) => void next('/faq', { items })} />
      )}
      {step === 4 && (
        <DoneStep
          data={data}
          busy={busy}
          onFinish={async () => {
            if (await save('/complete', undefined, 'POST')) {
              await refresh();
              go('/hoje');
            }
          }}
          goTo={setStep}
        />
      )}
    </>
  );
}

function StepForm({
  title,
  intro,
  busy,
  onSubmit,
  children,
}: {
  title: string;
  intro: string;
  busy: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="card form"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      {children}
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar e continuar'}
      </button>
    </form>
  );
}

const NOTICE_OPTIONS = [
  { value: 0, label: 'Sem antecedência mínima' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 240, label: '4 horas antes' },
  { value: 720, label: '12 horas antes' },
  { value: 1440, label: '1 dia antes' },
];

function BusinessStep({
  data,
  busy,
  onSave,
}: {
  data: SetupData;
  busy: boolean;
  onSave: (b: Omit<SetupData['business'], 'timezone'>) => void;
}) {
  const [name, setName] = useState(data.business.name);
  const [attendantName, setAttendantName] = useState(data.business.attendantName);
  const [slotStepMinutes, setSlotStep] = useState(data.business.slotStepMinutes);
  const [minNoticeMinutes, setMinNotice] = useState(data.business.minNoticeMinutes);
  const notice = NOTICE_OPTIONS.some((o) => o.value === minNoticeMinutes)
    ? NOTICE_OPTIONS
    : [...NOTICE_OPTIONS, { value: minNoticeMinutes, label: `${minNoticeMinutes} minutos antes` }];

  return (
    <StepForm
      title="Seu negócio"
      intro="Esses dados aparecem nas mensagens do robô para as suas clientes."
      busy={busy}
      onSubmit={() => onSave({ name, attendantName, slotStepMinutes, minNoticeMinutes })}
    >
      <label>
        Nome do negócio
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </label>
      <label>
        Quem atende (aparece no botão "Falar com…")
        <input
          value={attendantName}
          onChange={(e) => setAttendantName(e.target.value)}
          maxLength={60}
          required
        />
      </label>
      <label>
        De quanto em quanto tempo oferecer horários
        <select value={slotStepMinutes} onChange={(e) => setSlotStep(Number(e.target.value))}>
          {[15, 20, 30, 45, 60].map((v) => (
            <option key={v} value={v}>
              {v === 60 ? 'A cada 1 hora' : `A cada ${v} minutos`}
            </option>
          ))}
        </select>
      </label>
      <label>
        Até quando a cliente pode marcar
        <select value={minNoticeMinutes} onChange={(e) => setMinNotice(Number(e.target.value))}>
          {notice.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Fuso horário: {data.business.timezone}</p>
    </StepForm>
  );
}

interface ServiceRow {
  key: string;
  id?: string;
  name: string;
  duration: string;
  price: string;
}

let rowKey = 0;
const newKey = () => `n${++rowKey}`;

function ServicesStep({
  data,
  busy,
  onSave,
  onError,
}: {
  data: SetupData;
  busy: boolean;
  onSave: (
    services: { id?: string; name: string; durationMinutes: number; priceCents: number | null }[],
  ) => void;
  onError: (message: string | null) => void;
}) {
  const [rows, setRows] = useState<ServiceRow[]>(() =>
    data.services.length
      ? data.services.map((s) => ({
          key: s.id,
          id: s.id,
          name: s.name,
          duration: String(s.durationMinutes),
          price: formatPrice(s.priceCents),
        }))
      : [{ key: newKey(), name: '', duration: '60', price: '' }],
  );

  const update = (key: string, patch: Partial<ServiceRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    const services = [];
    for (const r of rows) {
      const name = r.name.trim();
      if (!name) continue;
      const durationMinutes = Number(r.duration);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
        onError(`${name}: duração entre 10 e 480 minutos.`);
        return;
      }
      const priceCents = parsePrice(r.price);
      if (priceCents === 'invalid') {
        onError(`${name}: escreva o preço só com números, como 150 ou 150,50.`);
        return;
      }
      services.push({ id: r.id, name, durationMinutes, priceCents });
    }
    if (!services.length) {
      onError('Cadastre pelo menos um serviço.');
      return;
    }
    onSave(services);
  }

  return (
    <StepForm
      title="Serviços"
      intro="O que as clientes podem marcar pelo WhatsApp. O preço é opcional."
      busy={busy}
      onSubmit={submit}
    >
      {rows.map((r, i) => (
        <fieldset key={r.key} className="fieldset">
          <legend>Serviço {i + 1}</legend>
          <label>
            Nome
            <input
              value={r.name}
              maxLength={60}
              onChange={(e) => update(r.key, { name: e.target.value })}
            />
          </label>
          <div className="row row--fields">
            <label>
              Duração (minutos)
              <input
                inputMode="numeric"
                value={r.duration}
                onChange={(e) => update(r.key, { duration: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <label>
              Preço (R$)
              <input
                inputMode="decimal"
                value={r.price}
                placeholder="Opcional"
                onChange={(e) => update(r.key, { price: e.target.value })}
              />
            </label>
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              className="link"
              onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
            >
              Remover {r.name.trim() || `serviço ${i + 1}`}
            </button>
          )}
        </fieldset>
      ))}
      {rows.length < 30 && (
        <button
          type="button"
          className="button button--ghost"
          onClick={() =>
            setRows((list) => [...list, { key: newKey(), name: '', duration: '60', price: '' }])
          }
        >
          Adicionar serviço
        </button>
      )}
    </StepForm>
  );
}

function HoursStep({
  data,
  busy,
  onSave,
  onError,
}: {
  data: SetupData;
  busy: boolean;
  onSave: (windows: SetupWindow[]) => void;
  onError: (message: string | null) => void;
}) {
  const [days, setDays] = useState(() => windowsToDays(data.windows));
  const update = (weekday: number, patch: Partial<DayForm>) =>
    setDays((d) => ({ ...d, [weekday]: { ...d[weekday]!, ...patch } }));

  function copyMonday() {
    const monday = days[1]!;
    setDays((d) => {
      const copy = { ...d };
      for (const { weekday } of WEEK) {
        if (weekday !== 1 && copy[weekday]!.open) copy[weekday] = { ...monday };
      }
      return copy;
    });
  }

  function submit() {
    const result = daysToWindows(days);
    if (typeof result === 'string') {
      onError(result);
      return;
    }
    if (!result.length) {
      onError('Marque pelo menos um dia de atendimento.');
      return;
    }
    onSave(result);
  }

  return (
    <StepForm
      title="Horários de atendimento"
      intro="O robô só oferece horários dentro destes períodos e que estejam livres."
      busy={busy}
      onSubmit={submit}
    >
      {WEEK.map(({ weekday, label }) => {
        const d = days[weekday]!;
        return (
          <fieldset key={weekday} className="fieldset">
            <legend>{label}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={d.open}
                onChange={(e) => update(weekday, { open: e.target.checked })}
              />
              {d.open ? 'Atende' : 'Não atende'}
            </label>
            {d.open && (
              <>
                <div className="row row--fields">
                  <label>
                    Começa
                    <input
                      type="time"
                      value={d.start}
                      onChange={(e) => update(weekday, { start: e.target.value })}
                    />
                  </label>
                  <label>
                    Termina
                    <input
                      type="time"
                      value={d.end}
                      onChange={(e) => update(weekday, { end: e.target.value })}
                    />
                  </label>
                </div>
                <div className="row row--fields">
                  <label>
                    Pausa de (opcional)
                    <input
                      type="time"
                      value={d.breakStart}
                      onChange={(e) => update(weekday, { breakStart: e.target.value })}
                    />
                  </label>
                  <label>
                    Até
                    <input
                      type="time"
                      value={d.breakEnd}
                      onChange={(e) => update(weekday, { breakEnd: e.target.value })}
                    />
                  </label>
                </div>
                {weekday === 1 && (
                  <button type="button" className="link" onClick={copyMonday}>
                    Usar o horário de segunda nos outros dias marcados
                  </button>
                )}
              </>
            )}
          </fieldset>
        );
      })}
    </StepForm>
  );
}

function FaqStep({
  data,
  busy,
  onSave,
}: {
  data: SetupData;
  busy: boolean;
  onSave: (items: { question: string; answer: string }[]) => void;
}) {
  const [items, setItems] = useState(() => data.faq.map((f) => ({ ...f, key: newKey() })));
  const update = (key: string, patch: { question?: string; answer?: string }) =>
    setItems((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  return (
    <StepForm
      title="Dúvidas frequentes"
      intro="Perguntas que as clientes fazem muito, com a sua resposta. O robô mostra numa lista. Pode pular e preencher depois."
      busy={busy}
      onSubmit={() =>
        onSave(
          items
            .map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() }))
            .filter((f) => f.question && f.answer),
        )
      }
    >
      {items.map((f, i) => (
        <fieldset key={f.key} className="fieldset">
          <legend>Dúvida {i + 1}</legend>
          <label>
            Pergunta (até 60 letras)
            <input
              value={f.question}
              maxLength={60}
              placeholder="Ex.: Onde fica o estúdio?"
              onChange={(e) => update(f.key, { question: e.target.value })}
            />
          </label>
          <label>
            Resposta
            <textarea
              rows={3}
              value={f.answer}
              maxLength={1000}
              onChange={(e) => update(f.key, { answer: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="link"
            onClick={() => setItems((list) => list.filter((x) => x.key !== f.key))}
          >
            Remover dúvida {i + 1}
          </button>
        </fieldset>
      ))}
      {items.length < 9 && (
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setItems((list) => [...list, { key: newKey(), question: '', answer: '' }])}
        >
          Adicionar dúvida
        </button>
      )}
    </StepForm>
  );
}

function DoneStep({
  data,
  busy,
  onFinish,
  goTo,
}: {
  data: SetupData;
  busy: boolean;
  onFinish: () => void;
  goTo: (step: number) => void;
}) {
  const days = new Set(data.windows.map((w) => w.weekday));
  const openDays = WEEK.filter((d) => days.has(d.weekday)).map((d) => d.label.toLowerCase());
  const ready = data.services.length > 0 && data.windows.length > 0;

  return (
    <section className="card form" aria-labelledby="pronto-titulo">
      <h2 id="pronto-titulo">Confira e conclua</h2>
      <dl className="summary">
        <dt>Negócio</dt>
        <dd>{data.business.name}</dd>
        <dt>Serviços</dt>
        <dd>
          {data.services.length ? (
            data.services.map((s) => `${s.name} (${s.durationMinutes} min)`).join(', ')
          ) : (
            <button type="button" className="link" onClick={() => goTo(1)}>
              Nenhum ainda. Cadastrar serviços
            </button>
          )}
        </dd>
        <dt>Dias de atendimento</dt>
        <dd>
          {openDays.length ? (
            openDays.join(', ')
          ) : (
            <button type="button" className="link" onClick={() => goTo(2)}>
              Nenhum ainda. Cadastrar horários
            </button>
          )}
        </dd>
        <dt>Dúvidas frequentes</dt>
        <dd>{data.faq.length ? `${data.faq.length} cadastrada(s)` : 'Nenhuma (opcional)'}</dd>
      </dl>
      {data.onboardingCompletedAt ? (
        <p className="muted">
          Configuração concluída. Você pode voltar aqui e mudar quando quiser.
        </p>
      ) : (
        <p className="muted">Depois de concluir, o robô já pode oferecer estes horários.</p>
      )}
      <button type="button" className="button" disabled={busy || !ready} onClick={onFinish}>
        {data.onboardingCompletedAt ? 'Voltar para o painel' : 'Concluir configuração'}
      </button>
    </section>
  );
}
