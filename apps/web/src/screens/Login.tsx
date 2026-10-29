import { type FormEvent, useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Banner } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, needsTotp ? totp : undefined);
    } catch (e) {
      if (e instanceof ApiError && (e.body as { totpRequired?: boolean } | null)?.totpRequired) {
        setNeedsTotp(true);
        setError('Digite o código de 6 dígitos do app autenticador.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>Entrar no painel</h1>
      <p className="muted">Agenda, clientes e conversas do seu negócio.</p>
      <form onSubmit={submit} className="form" noValidate>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {needsTotp && (
          <label>
            Código do app autenticador
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
