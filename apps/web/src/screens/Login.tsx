import { ArrowRight, KeyRound, Lock, User } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Banner } from '../components/ui';
import { AuthLayout, EmailNotVerified, FloatField, useAuthOptions } from './AuthPages';

export function Login() {
  const { login } = useAuth();
  const options = useAuthOptions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, needsTotp ? totp : undefined);
      // Depois de entrar, abre o painel no "Hoje" (e não na rota da tela de entrada).
      window.location.hash = '/hoje';
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as Record<string, unknown> | null) : null;
      if (body?.totpRequired) {
        setNeedsTotp(true);
        setError('Digite o código de 6 dígitos do app autenticador.');
      } else if (body?.emailNotVerified) {
        setUnverified(email.trim());
      } else {
        setError(e instanceof ApiError ? e.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (unverified) {
    return (
      <AuthLayout
        title="Confirme seu e-mail"
        footer={
          <button type="button" className="glass-link" onClick={() => setUnverified(null)}>
            Voltar para entrar
          </button>
        }
      >
        <EmailNotVerified email={unverified} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Entrar no painel"
      lead="Que bom te ver por aqui de novo."
      footer={
        options?.signupEnabled ? (
          <p className="glass-card__switch">
            Ainda não tem conta? <a href="#/criar-conta">Criar conta</a>
          </p>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="glass-form" noValidate>
        <FloatField
          id="login-email"
          label="E-mail"
          icon={<User aria-hidden="true" size={16} />}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="glass-form__password">
          <FloatField
            id="login-senha"
            label="Senha"
            icon={<Lock aria-hidden="true" size={16} />}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {options?.passwordResetEnabled && (
            <a href="#/esqueci-senha" className="glass-link glass-link--end">
              Esqueci a senha
            </a>
          )}
        </div>
        {needsTotp && (
          <FloatField
            id="login-totp"
            label="Código do app autenticador"
            icon={<KeyRound aria-hidden="true" size={16} />}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
          />
        )}
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button glass-form__submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
          {!busy && <ArrowRight aria-hidden="true" size={20} className="glass-form__arrow" />}
        </button>
      </form>
    </AuthLayout>
  );
}
