import { fillTemplate, TEMPLATE_FIELDS, unknownFields, type TemplateField } from '@nexo/core';
import { Archive, Check, Copy, Mail, MessageCircle, Pencil, Plus, ScrollText } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/hooks';

export interface MessageTemplate {
  id: string;
  channel: 'whatsapp' | 'email';
  name: string;
  subject: string | null;
  body: string;
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Valores de exemplo para a prévia (fictícios). */
export const SAMPLE: Record<TemplateField, string> = {
  nome: 'Bianca Souza (demo)',
  primeiro_nome: 'Bianca',
  negocio: 'Seu negócio',
  servico: 'Manutenção de cílios',
  data: '12/11',
  hora: '14:30',
};

/**
 * Modelos de mensagem (Premium): textos prontos de WhatsApp e e-mail com campos que se
 * preenchem sozinhos (nome da cliente, próximo horário...). Na conversa, "Usar modelo" põe o
 * texto pronto na caixa de resposta.
 */
export function Templates({ canEdit }: { canEdit: boolean }) {
  const { me } = useAuth();
  const list = useLoad(() => api<MessageTemplate[]>('/panel/templates'), 'templates');
  const [editing, setEditing] = useState<MessageTemplate | 'whatsapp' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const sample = { ...SAMPLE, negocio: me?.businessName ?? SAMPLE.negocio };
  // Ao copiar, só o nome do negócio entra; o resto fica "___" para completar antes de enviar.
  const own = { negocio: me?.businessName ?? null };

  async function archive(t: MessageTemplate) {
    if (!window.confirm(`Arquivar o modelo ${t.name}?`)) return;
    try {
      await api(`/panel/templates/${t.id}/archive`, { method: 'POST' });
      await list.reload();
    } catch (e) {
      setError(errorText(e, 'Não foi possível arquivar.'));
    }
  }

  const groups: {
    channel: 'whatsapp' | 'email';
    title: string;
    Icon: typeof Mail;
    note: string;
  }[] = [
    {
      channel: 'whatsapp',
      title: 'WhatsApp',
      Icon: MessageCircle,
      note: 'Aparecem em "Usar modelo" na resposta das Conversas e na ficha da cliente.',
    },
    {
      channel: 'email',
      title: 'E-mail',
      Icon: Mail,
      note: 'O painel ainda não manda e-mail para clientes: copie o texto, complete os espaços ___ e envie pelo seu e-mail.',
    },
  ];

  return (
    <>
      <PageHeader
        Icon={ScrollText}
        title="Modelos de mensagem"
        subtitle="Textos prontos para não digitar tudo de novo. Os campos entre chaves se preenchem sozinhos."
      />
      {error && <Banner>{error}</Banner>}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error && !list.data ? (
        <Banner>{list.error}</Banner>
      ) : (
        groups.map((g) => {
          const rows = (list.data ?? []).filter((t) => t.channel === g.channel);
          return (
            <section
              key={g.channel}
              className="card templates"
              aria-labelledby={`modelos-${g.channel}`}
            >
              <div className="row row--between templates__head">
                <h2 id={`modelos-${g.channel}`}>
                  <g.Icon aria-hidden="true" size={18} /> {g.title}
                </h2>
                {canEdit && (
                  <button
                    type="button"
                    className="button button--small"
                    onClick={() => setEditing(g.channel)}
                  >
                    <Plus aria-hidden="true" size={16} /> Novo modelo
                  </button>
                )}
              </div>
              <p className="muted small">{g.note}</p>
              {rows.length === 0 ? (
                <Empty title="Nenhum modelo ainda" icon={<g.Icon size={24} />}>
                  {canEdit
                    ? 'Crie um modelo para confirmar horário, lembrar a manutenção ou dar boas-vindas.'
                    : 'Quando a dona criar modelos, eles aparecem aqui.'}
                </Empty>
              ) : (
                <ul className="templates__list">
                  {rows.map((t) => (
                    <li key={t.id} className="templates__item">
                      <div className="row row--between">
                        <strong>{t.name}</strong>
                        <span className="templates__actions">
                          {g.channel === 'email' && (
                            <button
                              type="button"
                              className="icon-button icon-button--plain"
                              aria-label={
                                copied === t.id ? `${t.name} copiado` : `Copiar ${t.name}`
                              }
                              onClick={() =>
                                void navigator.clipboard
                                  ?.writeText(
                                    `${fillTemplate(t.subject ?? '', own)}\n\n${fillTemplate(t.body, own)}`,
                                  )
                                  .then(() => setCopied(t.id))
                              }
                            >
                              {copied === t.id ? (
                                <Check aria-hidden="true" size={16} />
                              ) : (
                                <Copy aria-hidden="true" size={16} />
                              )}
                            </button>
                          )}
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                className="icon-button icon-button--plain"
                                aria-label={`Editar ${t.name}`}
                                onClick={() => setEditing(t)}
                              >
                                <Pencil aria-hidden="true" size={16} />
                              </button>
                              <button
                                type="button"
                                className="icon-button icon-button--plain"
                                aria-label={`Arquivar ${t.name}`}
                                onClick={() => void archive(t)}
                              >
                                <Archive aria-hidden="true" size={16} />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      {t.subject && <p className="small">Assunto: {t.subject}</p>}
                      <p className="muted small templates__body">{t.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
      {editing && (
        <TemplateEditor
          initial={typeof editing === 'string' ? null : editing}
          channel={typeof editing === 'string' ? editing : editing.channel}
          sample={sample}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
    </>
  );
}

function TemplateEditor({
  initial,
  channel,
  sample,
  onClose,
  onSaved,
}: {
  initial: MessageTemplate | null;
  channel: 'whatsapp' | 'email';
  sample: Record<TemplateField, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const unknown = unknownFields(`${subject} ${body}`);

  function insert(field: string) {
    const el = area.current;
    const at = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const token = `{${field}}`;
    setBody(body.slice(0, at) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { channel, name, subject: channel === 'email' ? subject : null, body };
    try {
      if (initial) {
        await api(`/panel/templates/${initial.id}`, { method: 'PUT', body: payload });
      } else {
        await api('/panel/templates', { method: 'POST', body: payload });
      }
      onSaved();
    } catch (e) {
      setError(errorText(e, 'Não foi possível salvar.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`${initial ? 'Editar' : 'Novo'} modelo de ${channel === 'email' ? 'e-mail' : 'WhatsApp'}`}
      onClose={onClose}
    >
      <form className="form" onSubmit={save}>
        <label>
          Nome do modelo
          <input
            value={name}
            maxLength={60}
            placeholder="Ex.: Confirmar horário"
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {channel === 'email' && (
          <label>
            Assunto
            <input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
          </label>
        )}
        <label>
          Texto
          <textarea
            ref={area}
            rows={6}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div
          className="templates__fields"
          role="group"
          aria-label="Campos que se preenchem sozinhos"
        >
          {(Object.entries(TEMPLATE_FIELDS) as [TemplateField, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="button button--ghost button--small"
              title={label}
              onClick={() => insert(key)}
            >
              {`{${key}}`}
            </button>
          ))}
        </div>
        {unknown.length > 0 && (
          <Banner>Campo desconhecido: {`{${unknown[0]}}`}. Use os botões acima.</Banner>
        )}
        <div className="templates__preview" aria-label="Prévia">
          <p className="muted small">Prévia com dados de exemplo</p>
          {channel === 'email' && <strong>{fillTemplate(subject, sample)}</strong>}
          <p className="templates__body">{body ? fillTemplate(body, sample) : '…'}</p>
        </div>
        {error && <Banner>{error}</Banner>}
        <button
          type="submit"
          className="button"
          disabled={busy || name.trim().length < 2 || body.trim().length < 2 || unknown.length > 0}
        >
          Salvar modelo
        </button>
      </form>
    </Sheet>
  );
}

/** Lista de modelos de WhatsApp para pôr na resposta (Conversas e ficha da cliente). */
export function TemplatePicker({
  values,
  onPick,
}: {
  values: Partial<Record<TemplateField, string | null>>;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = useLoad(
    () =>
      open ? api<MessageTemplate[]>('/panel/templates?channel=whatsapp') : Promise.resolve([]),
    `templates-picker-${open}`,
  );
  return (
    <>
      <button
        type="button"
        className="button button--ghost button--small"
        onClick={() => setOpen(true)}
      >
        <ScrollText aria-hidden="true" size={16} /> Usar modelo
      </button>
      {open && (
        <Sheet title="Usar modelo" onClose={() => setOpen(false)}>
          {list.loading && !list.data ? (
            <Loading />
          ) : (list.data ?? []).length === 0 ? (
            <p className="muted">
              Nenhum modelo de WhatsApp ainda. Crie em Configurações, Modelos de mensagem.
            </p>
          ) : (
            <ul className="templates__list">
              {(list.data ?? []).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="templates__pick"
                    onClick={() => {
                      onPick(fillTemplate(t.body, values));
                      setOpen(false);
                    }}
                  >
                    <strong>{t.name}</strong>
                    <span className="muted small templates__body">
                      {fillTemplate(t.body, values)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
