import { ArrowLeft, ArrowRight, Building2, Lock, Mail, User } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { MadeByNexo, NexoLogo } from '../components/Brand';
import DataRain from '../components/DataRain';
import { Banner } from '../components/ui';
import { NICHES } from '../lib/niches';

export const MIN_PASSWORD = 10;

export interface AuthOptions {
  signupEnabled: boolean;
  passwordResetEnabled: boolean;
}

/** O que a tela de entrada pode oferecer. Sem resposta, esconde os dois links. */
export function useAuthOptions(): AuthOptions | null {
  const [options, setOptions] = useState<AuthOptions | null>(null);
  useEffect(() => {
    api<AuthOptions>('/auth/options')
      .then(setOptions)
      .catch(() => setOptions({ signupEnabled: false, passwordResetEnabled: false }));
  }, []);
  return options;
}

/** Fundo animado, marca e cartão de vidro: o mesmo para entrar, criar conta e recuperar senha. */
export function AuthLayout({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="login">
      <DataRain className="login__rain" />
      <div className="login__hero">
        <a href="#/" className="login__home" aria-label="Voltar para o início">
          <NexoLogo fundo="escuro" height={36} />
        </a>
        <p>Agenda, clientes e conversas do seu negócio, num lugar só.</p>
      </div>
      <div className="glass-card">
        <h1>{title}</h1>
        {lead && <p className="glass-card__lead">{lead}</p>}
        {children}
        {footer && <div className="glass-card__footer">{footer}</div>}
      </div>
      <MadeByNexo fundo="escuro" />
    </main>
  );
}

export function FloatField({
  id,
  label,
  icon,
  ...input
}: {
  id: string;
  label: string;
  icon: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="float-field">
      <input id={id} placeholder=" " {...input} />
      <label htmlFor={id}>
        {icon}
        {label}
      </label>
    </div>
  );
}

function SubmitButton({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button type="submit" className="button glass-form__submit" disabled={busy}>
      {busy ? busyLabel : label}
      {!busy && <ArrowRight aria-hidden="true" size={20} className="glass-form__arrow" />}
    </button>
  );
}

const BackToLogin = () => (
  <a href="#/entrar" className="glass-link">
    <ArrowLeft aria-hidden="true" size={16} />
    Voltar para entrar
  </a>
);

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere a senha no navegador antes de mandar (o servidor confere de novo). */
export function passwordIssue(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  }
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'A senha não pode ser igual ao e-mail.';
  }
  return null;
}

export function Signup() {
  const [form, setForm] = useState({
    businessName: '',
    niche: '',
    ownerName: '',
    email: '',
    password: '',
    confirm: '',
    acceptTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  function validate(): string | null {
    if (form.businessName.trim().length < 2) return 'Digite o nome do negócio.';
    if (!form.niche) return 'Escolha o tipo do negócio.';
    if (form.ownerName.trim().length < 2) return 'Digite seu nome.';
    if (!EMAIL_RE.test(form.email.trim())) return 'Digite um e-mail válido.';
    const issue = passwordIssue(form.password, form.email);
    if (issue) return issue;
    if (form.password !== form.confirm) return 'As duas senhas não são iguais.';
    if (!form.acceptTerms) return 'Para criar a conta, aceite os termos de uso.';
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const { businessName, niche, ownerName, email, password, acceptTerms } = form;
      await api('/auth/signup', {
        method: 'POST',
        body: { businessName, niche, ownerName, email: email.trim(), password, acceptTerms },
      });
      setSentTo(form.email.trim());
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar a conta.'));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confira seu e-mail" footer={<BackToLogin />}>
        <CheckEmail email={sentTo}>
          Se der tudo certo com o cadastro, o link para confirmar chega em <strong>{sentTo}</strong>
          . Ele vale por 24 horas. Depois de confirmar, é só entrar com seu e-mail e senha.
        </CheckEmail>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      lead="Leva só um minuto. Depois a gente te ajuda a configurar."
      footer={
        <p className="glass-card__switch">
          Já tem conta? <a href="#/entrar">Entrar</a>
        </p>
      }
    >
      <form onSubmit={submit} className="glass-form" noValidate>
        <FloatField
          id="signup-negocio"
          label="Nome do negócio"
          icon={<Building2 aria-hidden="true" size={16} />}
          autoComplete="organization"
          value={form.businessName}
          onChange={(e) => set('businessName', e.target.value)}
          maxLength={120}
          required
        />
        <div className="glass-select">
          <label htmlFor="signup-nicho">Tipo do negócio</label>
          <select
            id="signup-nicho"
            value={form.niche}
            onChange={(e) => set('niche', e.target.value)}
            required
          >
            <option value="" disabled>
              Escolha uma opção
            </option>
            {NICHES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
        <FloatField
          id="signup-nome"
          label="Seu nome"
          icon={<User aria-hidden="true" size={16} />}
          autoComplete="name"
          value={form.ownerName}
          onChange={(e) => set('ownerName', e.target.value)}
          maxLength={120}
          required
        />
        <FloatField
          id="signup-email"
          label="E-mail"
          icon={<Mail aria-hidden="true" size={16} />}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          required
        />
        <FloatField
          id="signup-senha"
          label={`Senha (mínimo ${MIN_PASSWORD} caracteres)`}
          icon={<Lock aria-hidden="true" size={16} />}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          required
        />
        <FloatField
          id="signup-confirmar"
          label="Repita a senha"
          icon={<Lock aria-hidden="true" size={16} />}
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          required
        />
        <label className="glass-check">
          <input
            type="checkbox"
            checked={form.acceptTerms}
            onChange={(e) => set('acceptTerms', e.target.checked)}
          />
          <span>
            Aceito os termos de uso e a política de privacidade.{' '}
            <small>Os textos ainda estão sendo preparados.</small>
          </span>
        </label>
        {error && <Banner>{error}</Banner>}
        <SubmitButton busy={busy} label="Criar conta" busyLabel="Criando…" />
      </form>
    </AuthLayout>
  );
}

/** Aviso de "confira seu e-mail" com a opção de pedir o link de novo. */
function CheckEmail({ email, children }: { email: string; children: ReactNode }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setState('busy');
    try {
      await api('/auth/verify-email/resend', { method: 'POST', body: { email } });
      setState('sent');
    } catch (e) {
      setMessage(errorText(e, 'Não foi possível pedir um novo link.'));
      setState('error');
    }
  }

  return (
    <div className="glass-form">
      <p className="glass-card__text">{children}</p>
      <p className="glass-card__text glass-card__text--soft">
        Não chegou? Olhe a caixa de spam ou peça um novo link.
      </p>
      {state === 'sent' && <Banner kind="ok">Pronto, mandamos um novo link.</Banner>}
      {state === 'error' && message && <Banner>{message}</Banner>}
      <button
        type="button"
        className="button button--ghost glass-form__secondary"
        onClick={() => void resend()}
        disabled={state === 'busy'}
      >
        {state === 'busy' ? 'Enviando…' : 'Mandar o link de novo'}
      </button>
    </div>
  );
}

export function EmailNotVerified({ email }: { email: string }) {
  return (
    <CheckEmail email={email}>
      Falta confirmar seu e-mail. Abra o link que mandamos para <strong>{email}</strong>.
    </CheckEmail>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Digite um e-mail válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (e) {
      setError(errorText(e, 'Não foi possível pedir o link.'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Confira seu e-mail" footer={<BackToLogin />}>
        <p className="glass-card__text">
          Se existir uma conta com <strong>{email.trim()}</strong>, o link para criar uma nova senha
          chega em alguns minutos. Ele vale por 30 minutos e funciona uma vez só.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueci a senha"
      lead="Digite seu e-mail e a gente manda um link para criar uma nova senha."
      footer={<BackToLogin />}
    >
      <form onSubmit={submit} className="glass-form" noValidate>
        <FloatField
          id="esqueci-email"
          label="E-mail"
          icon={<Mail aria-hidden="true" size={16} />}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <Banner>{error}</Banner>}
        <SubmitButton busy={busy} label="Mandar link" busyLabel="Enviando…" />
      </form>
    </AuthLayout>
  );
}

export function ResetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const issue =
      passwordIssue(password, '') ??
      (password !== confirm ? 'As duas senhas não são iguais.' : null);
    setError(issue);
    if (issue) return;
    setBusy(true);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, newPassword: password } });
      setDone(true);
    } catch (e) {
      setError(errorText(e, 'Não foi possível trocar a senha.'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <LinkProblem />;
  if (done) {
    return (
      <AuthLayout title="Senha nova criada">
        <div className="glass-form">
          <p className="glass-card__text">
            Pronto! Por segurança, saímos do painel em todos os aparelhos. Entre com a senha nova.
          </p>
          <a href="#/entrar" className="button glass-form__submit">
            Entrar
            <ArrowRight aria-hidden="true" size={20} className="glass-form__arrow" />
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar nova senha"
      lead={`Use pelo menos ${MIN_PASSWORD} caracteres.`}
      footer={<BackToLogin />}
    >
      <form onSubmit={submit} className="glass-form" noValidate>
        <FloatField
          id="nova-senha"
          label="Nova senha"
          icon={<Lock aria-hidden="true" size={16} />}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <FloatField
          id="nova-senha-confirmar"
          label="Repita a nova senha"
          icon={<Lock aria-hidden="true" size={16} />}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && <Banner>{error}</Banner>}
        {error?.includes('venceu') && (
          <a href="#/esqueci-senha" className="glass-link">
            Pedir um novo link
          </a>
        )}
        <SubmitButton busy={busy} label="Salvar senha nova" busyLabel="Salvando…" />
      </form>
    </AuthLayout>
  );
}

export function ConfirmEmail({ token }: { token: string }) {
  const [state, setState] = useState<'busy' | 'ok' | 'error'>(token ? 'busy' : 'error');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // O link vale uma vez: não pode ser gasto duas vezes pelo modo estrito do React.
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch((e: unknown) => {
        setMessage(errorText(e, 'Não foi possível confirmar o e-mail.'));
        setState('error');
      });
  }, [token]);

  if (state === 'busy') {
    return (
      <AuthLayout title="Confirmando seu e-mail…">
        <p className="glass-card__text" role="status">
          Só um instante.
        </p>
      </AuthLayout>
    );
  }
  if (state === 'error') {
    return (
      <LinkProblem
        message={message}
        action={
          <a href="#/entrar" className="glass-link">
            Entrar para pedir um novo link
          </a>
        }
      />
    );
  }
  return (
    <AuthLayout title="E-mail confirmado">
      <div className="glass-form">
        <p className="glass-card__text">Tudo certo! Agora é só entrar com seu e-mail e senha.</p>
        <a href="#/entrar" className="button glass-form__submit">
          Entrar
          <ArrowRight aria-hidden="true" size={20} className="glass-form__arrow" />
        </a>
      </div>
    </AuthLayout>
  );
}

function LinkProblem({ message, action }: { message?: string | null; action?: ReactNode }) {
  return (
    <AuthLayout title="Esse link não funcionou" footer={<BackToLogin />}>
      <div className="glass-form">
        <p className="glass-card__text">
          {message ?? 'Esse link venceu ou já foi usado. Peça um novo.'}
        </p>
        {action ?? (
          <a href="#/esqueci-senha" className="glass-link">
            Pedir um novo link
          </a>
        )}
      </div>
    </AuthLayout>
  );
}
