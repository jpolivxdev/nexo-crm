import { type FormEvent, useEffect, useState } from 'react';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useLoad } from '../lib/hooks';

interface BotMessage {
  key: string;
  default: string;
  custom: string | null;
  variables: string[];
  max: number;
  button: boolean;
}

/** O que cada mensagem é, na língua da dona. A ordem segue a conversa. */
const GROUPS: { title: string; note?: string; items: [string, string][] }[] = [
  {
    title: 'Primeira mensagem e menu',
    items: [
      ['privacyNotice', 'Aviso da primeira conversa'],
      ['menu', 'Menu'],
      ['menuBook', 'Botão: marcar'],
      ['menuMine', 'Botão: meus horários'],
      ['menuFaq', 'Botão: dúvidas'],
      ['menuHuman', 'Botão: falar com você'],
      ['notUnderstood', 'Quando o robô não entende'],
      ['more', 'Botão: ver mais opções'],
    ],
  },
  {
    title: 'Marcar horário',
    items: [
      ['chooseService', 'Pergunta do serviço'],
      ['noServices', 'Sem serviço cadastrado'],
      ['chooseProfessional', 'Pergunta da profissional'],
      ['anyProfessional', 'Botão: tanto faz'],
      ['chooseDate', 'Pergunta do dia'],
      ['noDates', 'Sem dia livre'],
      ['chooseTime', 'Pergunta do horário'],
      ['noTimes', 'O dia lotou'],
      ['confirm', 'Pedido de confirmação'],
      ['confirmYes', 'Botão: confirmar'],
      ['confirmOtherTime', 'Botão: outro horário'],
      ['booked', 'Horário marcado'],
      ['slotTaken', 'Alguém pegou o horário antes'],
    ],
  },
  {
    title: 'Remarcar e cancelar',
    items: [
      ['mineEmpty', 'Sem horário marcado'],
      ['mineList', 'Lista dos horários da cliente'],
      ['manage', 'O que fazer com o horário'],
      ['manageReschedule', 'Botão: remarcar'],
      ['manageCancel', 'Botão: cancelar'],
      ['manageBack', 'Botão: voltar'],
      ['cancelConfirm', 'Confirmar cancelamento'],
      ['cancelYes', 'Botão: sim, cancelar'],
      ['cancelNo', 'Botão: não'],
      ['cancelled', 'Horário cancelado'],
      ['rescheduled', 'Horário remarcado'],
    ],
  },
  {
    title: 'Dúvidas, você e "parar"',
    items: [
      ['faqList', 'Lista de dúvidas'],
      ['faqEmpty', 'Sem dúvida cadastrada'],
      ['handoff', 'Cliente pediu você'],
      ['handoffClosed', 'Cliente pediu você fora do horário'],
      ['optOut', 'Cliente pediu para parar'],
    ],
  },
  {
    title: 'Lembretes',
    note: 'Quando o WhatsApp oficial entrar, lembretes enviados fora da conversa usam modelos aprovados pela Meta. Mudar estes textos vai pedir uma nova aprovação.',
    items: [
      ['reminder24h', 'Lembrete um dia antes'],
      ['reminder1h', 'Lembrete uma hora antes'],
      ['reminderConfirmed', 'Cliente confirmou'],
      ['reminderGone', 'O horário não existe mais'],
    ],
  },
];

const VARIABLE_LABEL: Record<string, string> = {
  negocio: 'nome do negócio',
  dona: 'seu nome',
  servico: 'serviço',
  data: 'dia',
  hora: 'hora',
};

/** Mensagens do robô: a dona troca qualquer texto e pode voltar ao padrão. */
export function BotMessages({ go }: { go: (to: string) => void }) {
  const { data, error, loading } = useLoad(
    () => api<{ messages: BotMessage[] }>('/panel/setup/messages'),
    '',
  );
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<{ key?: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data)
      setTexts(Object.fromEntries(data.messages.map((m) => [m.key, m.custom ?? m.default])));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const byKey = new Map(data.messages.map((m) => [m.key, m]));

  function edit(key: string, value: string) {
    setTexts((t) => ({ ...t, [key]: value }));
    setSaved(false);
    if (saveError?.key === key) setSaveError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      // Só manda o que é diferente do padrão; o resto volta ao padrão.
      const messages = Object.fromEntries(
        Object.entries(texts).filter(([key, value]) => value.trim() !== byKey.get(key)?.default),
      );
      await api('/panel/setup/messages', { method: 'PUT', body: { messages } });
      setSaved(true);
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { key?: string } | null) : null;
      setSaveError({
        key: body?.key,
        message: e instanceof ApiError ? e.message : 'Não foi possível salvar.',
      });
      if (body?.key) document.getElementById(`msg-${body.key}`)?.focus();
    } finally {
      setBusy(false);
    }
  }

  const changed = data.messages.filter((m) => (texts[m.key] ?? '').trim() !== m.default).length;

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <header className="page-header">
        <h1>Mensagens do robô</h1>
        <p className="muted">
          Escreva do seu jeito. As palavras entre chaves, como {'{servico}'}, viram o nome do
          serviço, o dia ou a hora na hora de mandar.
        </p>
      </header>

      <form className="form" onSubmit={submit}>
        {GROUPS.map((group, i) => (
          <section key={group.title} className="section" aria-labelledby={`grupo-${i}`}>
            <h2 id={`grupo-${i}`}>{group.title}</h2>
            {group.note && <p className="muted small">{group.note}</p>}
            {group.items.map(([key, label]) => {
              const m = byKey.get(key);
              if (!m) return null;
              const value = texts[key] ?? '';
              const isDefault = value.trim() === m.default;
              const hasError = saveError?.key === key;
              return (
                <div
                  key={key}
                  className={`card message-edit${hasError ? ' message-edit--error' : ''}`}
                >
                  <label htmlFor={`msg-${key}`}>{label}</label>
                  {m.button ? (
                    <input
                      id={`msg-${key}`}
                      value={value}
                      maxLength={m.max}
                      aria-invalid={hasError || undefined}
                      onChange={(e) => edit(key, e.target.value)}
                    />
                  ) : (
                    <textarea
                      id={`msg-${key}`}
                      rows={3}
                      value={value}
                      maxLength={m.max}
                      aria-invalid={hasError || undefined}
                      onChange={(e) => edit(key, e.target.value)}
                    />
                  )}
                  <p className="muted small message-edit__meta">
                    {m.variables.length > 0 && (
                      <span>
                        Pode usar:{' '}
                        {m.variables.map((v) => `{${v}} (${VARIABLE_LABEL[v] ?? v})`).join(', ')}
                      </span>
                    )}
                    {m.button && (
                      <span>
                        {value.length}/{m.max} letras (botão do WhatsApp)
                      </span>
                    )}
                  </p>
                  {hasError && <Banner>{saveError.message}</Banner>}
                  {!isDefault && (
                    <button
                      type="button"
                      className="link small"
                      onClick={() => edit(key, m.default)}
                    >
                      Voltar ao texto padrão
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        <div className="sticky-save">
          {saveError && !saveError.key && <Banner>{saveError.message}</Banner>}
          {saveError?.key && <Banner>Confira a mensagem marcada: {saveError.message}</Banner>}
          {saved && <Banner kind="ok">Mensagens salvas. O robô já usa os textos novos.</Banner>}
          <button type="submit" className="button" disabled={busy}>
            {busy
              ? 'Salvando…'
              : changed > 0
                ? `Salvar (${changed} ${changed === 1 ? 'mudada' : 'mudadas'})`
                : 'Salvar'}
          </button>
        </div>
      </form>
    </>
  );
}
