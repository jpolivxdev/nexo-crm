import { ArrowRight, KeyRound, Lock, User } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MadeByNexo, NexoLogo } from '../components/Brand';
import DataRain from '../components/DataRain';
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
      <DataRain className="login__rain" />
      <div className="login__hero">
        <NexoLogo fundo="escuro" height={36} />
        <p>Agenda, clientes e conversas do seu negócio, num lugar só.</p>
      </div>
      <div className="glass-card">
        <h1>Entrar no painel</h1>
        <p className="glass-card__lead">Que bom te ver por aqui de novo.</p>
        <form onSubmit={submit} className="glass-form" noValidate>
          <div className="float-field">
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="login-email">
              <User aria-hidden="true" size={16} />
              E-mail
            </label>
          </div>
          <div className="float-field">
            <input
              id="login-senha"
              type="password"
              autoComplete="current-password"
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <label htmlFor="login-senha">
              <Lock aria-hidden="true" size={16} />
              Senha
            </label>
          </div>
          {needsTotp && (
            <div className="float-field">
              <input
                id="login-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder=" "
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
              />
              <label htmlFor="login-totp">
                <KeyRound aria-hidden="true" size={16} />
                Código do app autenticador
              </label>
            </div>
          )}
          {error && <Banner>{error}</Banner>}
          <button type="submit" className="button glass-form__submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
            {!busy && <ArrowRight aria-hidden="true" size={20} className="glass-form__arrow" />}
          </button>
        </form>
      </div>
      <MadeByNexo fundo="escuro" />
    </main>
  );
}
