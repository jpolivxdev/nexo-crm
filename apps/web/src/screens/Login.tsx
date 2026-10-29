import { type FormEvent, useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MadeByNexo, NexoLogo } from '../components/Brand';
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
      <div className="login__hero">
        <NexoLogo fundo="escuro" height={36} />
        <p>Agenda, clientes e conversas do seu negócio, num lugar só.</p>
      </div>
      <div className="auth-card">
        <h1>Entrar no painel</h1>
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
      </div>
      <MadeByNexo />
    </main>
  );
}
