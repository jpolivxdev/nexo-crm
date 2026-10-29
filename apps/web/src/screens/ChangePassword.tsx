import { type FormEvent, useState } from 'react';
import { Banner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Me } from '../lib/types';

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Troca de senha. `forced`: primeiro acesso com senha provisória, sem outra saída além de sair.
 * Ao trocar, as outras sessões são encerradas e esta recebe um cookie novo.
 */
export function ChangePassword({ forced, onDone }: { forced: boolean; onDone?: () => void }) {
  const { accept, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== repeat) {
      setError('As duas senhas novas não são iguais.');
      return;
    }
    setBusy(true);
    try {
      const me = await api<Me>('/auth/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
      accept(me);
      onDone?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={forced ? 'login' : undefined} aria-labelledby="senha-titulo">
      <h1 id="senha-titulo">{forced ? 'Crie a sua senha' : 'Trocar senha'}</h1>
      <p className="muted">
        {forced
          ? 'Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.'
          : 'Ao trocar, os outros aparelhos conectados saem do painel.'}
      </p>
      <form onSubmit={submit} className="form" noValidate>
        <label>
          {forced ? 'Senha provisória' : 'Senha atual'}
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby="senha-dica"
            required
          />
        </label>
        <p id="senha-dica" className="muted small">
          Pelo menos {MIN_PASSWORD_LENGTH} caracteres. Uma frase curta é fácil de lembrar e difícil
          de adivinhar.
        </p>
        <label>
          Repita a nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </label>
        {error && <Banner>{error}</Banner>}
        {done && !forced && <Banner kind="ok">Senha trocada.</Banner>}
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar senha'}
        </button>
        {forced && (
          <button type="button" className="button button--ghost" onClick={() => void logout()}>
            Sair
          </button>
        )}
      </form>
    </section>
  );
}
