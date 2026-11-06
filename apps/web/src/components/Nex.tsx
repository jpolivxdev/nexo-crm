import { Compass, Send, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import nexFoto from '../assets/nex.webp';
import { api, ApiError } from '../lib/api';

interface Turn {
  role: 'user' | 'model';
  text: string;
}

/** Mensagem do servidor mesmo em 503/429 (o api() troca 5xx por um texto genérico). */
function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: unknown } | null;
    if (body && typeof body.message === 'string') return body.message;
    return err.message;
  }
  return 'O Nex não conseguiu responder agora.';
}

/** Atalho do guia: leva para uma tela e abre o tour dela. */
export interface NexTopic {
  label: string;
  to: string;
}

/**
 * Nex, guia de uso. Mostra o caminho pelos tours de cada tela e, quando a nexo liga a IA, responde
 * perguntas livres sobre o uso do painel. Não vê os dados do negócio: só sabe onde fica cada coisa.
 */
export function Nex({
  topics,
  onTour,
}: {
  topics: NexTopic[];
  /** Abre o tour da tela (e navega até ela, se for outra). */
  onTour: (to?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState<{ enabled: boolean; left: number } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Ao abrir: a caixa de pergunta só aparece se a IA estiver ligada para o negócio.
  useEffect(() => {
    if (!open || ai) return;
    let alive = true;
    api<{ enabled: boolean; left: number }>('/panel/assistant')
      .then((r) => alive && setAi(r))
      .catch(() => alive && setAi({ enabled: false, left: 0 }));
    return () => {
      alive = false;
    };
  }, [open, ai]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ answer: string; left: number }>('/panel/assistant', {
        method: 'POST',
        body: { question: q, history: turns.slice(-4) },
      });
      setTurns((t) => [...t, { role: 'user', text: q }, { role: 'model', text: r.answer }]);
      setAi({ enabled: true, left: r.left });
      setQuestion('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function pick(to?: string) {
    setOpen(false);
    onTour(to);
  }

  return (
    <>
      {open && (
        <div ref={panel} className="nex__panel" role="dialog" aria-labelledby="nex-titulo">
          <div className="nex__head">
            <img src={nexFoto} alt="" className="nex__foto" width={40} height={40} />
            <div>
              <h2 id="nex-titulo">Nex, guia de uso</h2>
              <p className="muted small">Mostra o caminho. Não vê os dados das suas clientes.</p>
            </div>
            <button
              type="button"
              className="tour__close"
              aria-label="Fechar o guia"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <p>
            {ai?.enabled
              ? 'Oi! Eu sou o Nex. Pergunte como fazer alguma coisa no painel, ou escolha um assunto e eu mostro onde fica.'
              : 'Oi! Eu sou o Nex. Escolha um assunto e eu mostro onde fica, passo a passo.'}
          </p>
          {turns.length > 0 && (
            <ol className="nex__chat" aria-live="polite">
              {turns.map((t, i) => (
                <li key={i} className={t.role === 'user' ? 'nex__msg nex__msg--eu' : 'nex__msg'}>
                  <span className="sr-only">{t.role === 'user' ? 'Você: ' : 'Nex: '}</span>
                  {t.text}
                </li>
              ))}
            </ol>
          )}
          {ai?.enabled && (
            <form className="nex__ask" onSubmit={ask}>
              <label htmlFor="nex-pergunta" className="sr-only">
                Sua dúvida sobre o painel
              </label>
              <textarea
                id="nex-pergunta"
                rows={2}
                maxLength={500}
                placeholder="Ex.: como fecho um dia de folga?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={busy || ai.left === 0}
              />
              <button
                type="submit"
                className="button"
                aria-label="Perguntar ao Nex"
                disabled={busy || ai.left === 0 || question.trim().length < 3}
              >
                <Send aria-hidden="true" size={18} />
              </button>
              <p className="muted small nex__aviso">
                Não escreva nome, telefone ou dado de cliente. A pergunta vai para o Gemini, do
                Google.{' '}
                {ai.left === 0 ? 'Acabaram as perguntas de hoje.' : `Restam ${ai.left} hoje.`}
              </p>
              {busy && <p className="muted small">O Nex está pensando...</p>}
              {error && (
                <p className="banner banner--error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
          <ul className="nex__topics">
            <li>
              <button type="button" className="nex__topic" onClick={() => pick()}>
                <Compass aria-hidden="true" size={16} /> Me mostra esta tela
              </button>
            </li>
            {topics.map((t) => (
              <li key={t.to + t.label}>
                <button type="button" className="nex__topic" onClick={() => pick(t.to)}>
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="nex__button"
        aria-label="Nex, guia de uso"
        aria-expanded={open}
        data-tour="nex"
        onClick={() => setOpen((v) => !v)}
      >
        <img src={nexFoto} alt="" width={56} height={56} />
      </button>
    </>
  );
}
