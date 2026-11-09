import { type FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { dateTime } from '../lib/format';
import { Banner } from './ui';

export type SupportStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface SupportMessage {
  id: string;
  authorType: 'owner' | 'nexo' | string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  topic: string;
  subject: string;
  status: SupportStatus;
  ownerUnread: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
  tenantName?: string;
}

export const SUPPORT_TOPICS: { id: string; label: string }[] = [
  { id: 'duvida', label: 'Dúvida de como usar' },
  { id: 'problema', label: 'Algo não funciona' },
  { id: 'pedido', label: 'Pedido de melhoria' },
  { id: 'whatsapp', label: 'WhatsApp e robô' },
  { id: 'conta', label: 'Conta, plano e pagamento' },
  { id: 'outro', label: 'Outro assunto' },
];

export function topicLabel(id: string): string {
  return SUPPORT_TOPICS.find((t) => t.id === id)?.label ?? id;
}

/** Situação do chamado, escrita (nunca só pela cor). Muda o texto conforme quem está lendo. */
export function statusLabel(status: SupportStatus, side: 'owner' | 'nexo'): string {
  if (status === 'CLOSED') return 'Resolvido';
  if (status === 'ANSWERED') return side === 'owner' ? 'Respondido' : 'Esperando a dona';
  return side === 'owner' ? 'Com a nexo' : 'Esperando a nexo';
}

/** Conversa do chamado, mais o campo para escrever. Texto sempre como texto puro. */
export function SupportThread({
  ticket,
  timeZone,
  side,
  replyPath,
  onSent,
}: {
  ticket: SupportTicket;
  timeZone: string;
  side: 'owner' | 'nexo';
  replyPath: string;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = ticket.status === 'CLOSED';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(replyPath, { method: 'POST', body: { body: text } });
      setText('');
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ol className="chat support-chat" aria-label="Mensagens do chamado">
        {(ticket.messages ?? []).map((m) => {
          const mine = m.authorType === side;
          return (
            <li key={m.id} className={`bubble bubble--${mine ? 'out' : 'in'}`}>
              <strong className="small">
                {m.authorType === 'nexo' ? `${m.authorName} · nexo` : m.authorName}
              </strong>
              <span>{m.body}</span>
              <small className="muted">{dateTime(m.createdAt, timeZone)}</small>
            </li>
          );
        })}
      </ol>
      {closed && side === 'nexo' ? (
        <p className="muted small">Chamado resolvido. Se a dona escrever de novo, ele reabre.</p>
      ) : (
        <form className="form reply" onSubmit={submit}>
          <label>
            {side === 'owner'
              ? closed
                ? 'Escrever de novo (reabre o chamado)'
                : 'Escrever para a nexo'
              : 'Responder a dona'}
            <textarea
              rows={3}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {error && <Banner>{error}</Banner>}
          <button type="submit" className="button" disabled={busy || !text.trim()}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </>
  );
}
