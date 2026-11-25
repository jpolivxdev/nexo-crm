import {
  BellRing,
  CalendarOff,
  ChevronRight,
  CreditCard,
  Headset,
  MessageSquareText,
  Palette,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GlassControls } from '../components/GlassControls';
import { setThemePref, type ThemePref, useThemePref } from '../lib/theme';
import { ChangePassword } from './ChangePassword';

/**
 * Configurações no molde novo: um menu próprio (ao lado no computador, em lista no celular) que
 * junta a conta da dona e as configurações do negócio. As telas de cada item continuam as mesmas.
 */
export interface SettingsItem {
  to: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  group: 'Você' | 'Negócio' | 'nexo';
  /** Quem vê: área liberada por papel (Acessos) ou só o dono. Sem isto, todos do painel. */
  needs?: 'settings' | 'owner';
}

export const SETTINGS: SettingsItem[] = [
  {
    to: '/conta',
    label: 'Meu perfil e segurança',
    hint: 'Nome, senha, tema e aparelhos conectados',
    Icon: UserRound,
    group: 'Você',
  },
  {
    to: '/configurar',
    needs: 'settings',
    label: 'Dados do negócio',
    hint: 'Serviços, horários de atendimento e dúvidas',
    Icon: Store,
    group: 'Negócio',
  },
  {
    to: '/equipe',
    needs: 'owner',
    label: 'Equipe',
    hint: 'Profissionais, serviços de cada uma e acessos',
    Icon: Users,
    group: 'Negócio',
  },
  {
    to: '/acessos',
    needs: 'owner',
    label: 'Acessos',
    hint: 'O que cada papel da equipe vê e a verificação em duas etapas',
    Icon: ShieldCheck,
    group: 'Negócio',
  },
  {
    to: '/mensagens',
    needs: 'settings',
    label: 'Mensagens do robô',
    hint: 'Os textos que o robô manda no WhatsApp',
    Icon: MessageSquareText,
    group: 'Negócio',
  },
  {
    to: '/avisos',
    needs: 'settings',
    label: 'Avisos',
    hint: 'O que te avisar e o lembrete do próximo horário',
    Icon: BellRing,
    group: 'Negócio',
  },
  {
    to: '/folgas',
    needs: 'settings',
    label: 'Folgas e bloqueios',
    hint: 'Dias e horários em que você não atende',
    Icon: CalendarOff,
    group: 'Negócio',
  },
  {
    to: '/marca',
    needs: 'settings',
    label: 'Marca e domínio',
    hint: 'Logo, cor, fonte e endereço próprio',
    Icon: Palette,
    group: 'Negócio',
  },
  {
    to: '/modelos',
    needs: 'settings',
    label: 'Modelos de mensagem',
    hint: 'Textos prontos de WhatsApp e e-mail',
    Icon: ScrollText,
    group: 'Negócio',
  },
  {
    to: '/assinatura',
    needs: 'owner',
    label: 'Plano e assinatura',
    hint: 'Seu plano atual',
    Icon: CreditCard,
    group: 'nexo',
  },
  {
    to: '/suporte',
    label: 'Suporte',
    hint: 'Abrir um chamado para a nexo',
    Icon: Headset,
    group: 'nexo',
  },
];

export const SETTINGS_ROUTES = new Set(SETTINGS.map((s) => s.to));

const GROUPS: SettingsItem['group'][] = ['Você', 'Negócio', 'nexo'];

function SettingsMenu({ section, items }: { section: string; items: SettingsItem[] }) {
  return (
    <>
      {GROUPS.map((group) => {
        const list = items.filter((i) => i.group === group);
        if (list.length === 0) return null;
        return (
          <div key={group} className="settings__group">
            <p className="settings__group-title">{group}</p>
            <ul>
              {list.map(({ to, label, hint, Icon }) => (
                <li key={to}>
                  <a
                    href={`#${to}`}
                    className={section === to ? 'settings__link on' : 'settings__link'}
                    aria-current={section === to ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" size={18} />
                    <span>
                      <strong>{label}</strong>
                      <span className="muted small">{hint}</span>
                    </span>
                    <ChevronRight aria-hidden="true" size={16} className="settings__chevron" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/**
 * Moldura das telas de configuração: menu ao lado no computador. No celular o menu fica só na
 * tela Configurações, e cada tela tem o "Voltar" dela.
 */
export function SettingsLayout({
  section,
  items,
  children,
}: {
  section: string;
  items: SettingsItem[];
  children: ReactNode;
}) {
  return (
    <div className="settings">
      <nav className="settings__aside" aria-label="Configurações">
        <SettingsMenu section={section} items={items} />
      </nav>
      <div className="settings__content">{children}</div>
    </div>
  );
}

interface Profile {
  name: string;
  email: string;
  twoFactor: boolean;
  otherSessions: number;
}

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'claro', label: 'Claro' },
  { id: 'escuro', label: 'Escuro' },
  { id: 'sistema', label: 'Igual ao celular' },
];

/** Aparência do painel: vale só neste aparelho. */
function ThemePicker() {
  const pref = useThemePref();
  return (
    <section className="card" aria-labelledby="aparencia">
      <h2 id="aparencia">Aparência</h2>
      <p className="muted">Escolha as cores e o efeito do painel neste aparelho.</p>
      <div className="segmented" role="group" aria-labelledby="aparencia">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={pref === t.id}
            className={pref === t.id ? 'on' : ''}
            onClick={() => setThemePref(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <GlassControls />
    </section>
  );
}

function ProfileCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { refresh } = useAuth();
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await api<{ name: string; email: string }>('/auth/profile', {
        method: 'POST',
        body: { name },
      });
      onSaved({ ...profile, name: r.name });
      setName(r.name);
      setDone(true);
      void refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="perfil">
      <h2 id="perfil">Meu perfil</h2>
      <form className="form" onSubmit={submit} noValidate>
        <label>
          Seu nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={80}
            required
          />
        </label>
        <label>
          E-mail de acesso
          <input value={profile.email} readOnly aria-describedby="email-dica" />
        </label>
        <p id="email-dica" className="muted small">
          É com ele que você entra no painel. Para trocar, abra um chamado no Suporte.
        </p>
        {error && <Banner>{error}</Banner>}
        {done && <Banner kind="ok">Nome salvo.</Banner>}
        <button type="submit" className="button" disabled={busy || name.trim() === profile.name}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  );
}

function SessionsCard({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function revoke() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ revoked: number }>('/auth/sessions/revoke-others', { method: 'POST' });
      onChange({ ...profile, otherSessions: 0 });
      setMessage({
        kind: 'ok',
        text:
          r.revoked === 1
            ? 'Pronto: 1 aparelho saiu do painel.'
            : `Pronto: ${r.revoked} aparelhos saíram do painel.`,
      });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível agora.',
      });
    } finally {
      setBusy(false);
    }
  }

  const others = profile.otherSessions;
  return (
    <section className="card" aria-labelledby="aparelhos">
      <h2 id="aparelhos">Aparelhos conectados</h2>
      <p className="muted">
        {others === 0
          ? 'Só este aparelho está com o painel aberto.'
          : others === 1
            ? 'Além deste, 1 outro aparelho está com o painel aberto.'
            : `Além deste, ${others} outros aparelhos estão com o painel aberto.`}{' '}
        Se você não reconhece algum, saia deles e troque a senha.
      </p>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}
      <button
        type="button"
        className="button button--ghost"
        disabled={busy || others === 0}
        onClick={() => void revoke()}
      >
        Sair dos outros aparelhos
      </button>
    </section>
  );
}

/**
 * Verificação em duas etapas: na entrada, além da senha, um código de 6 dígitos do app
 * autenticador do celular (Google Authenticator, Microsoft Authenticator, Authy...).
 */
export function TwoFactorCard({
  enabled,
  onChange,
  forced = false,
}: {
  enabled: boolean;
  onChange?: (on: boolean) => void;
  forced?: boolean;
}) {
  const { refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [turningOff, setTurningOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível agora.',
      });
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      setSetup(await api<{ secret: string; uri: string }>('/auth/2fa/start', { method: 'POST' }));
      setCode('');
    });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    void run(async () => {
      await api('/auth/2fa/enable', { method: 'POST', body: { secret: setup.secret, code } });
      setSetup(null);
      setCode('');
      setMessage({
        kind: 'ok',
        text: 'Verificação ligada. Na próxima entrada, o painel pede o código.',
      });
      onChange?.(true);
      await refresh();
    });
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api('/auth/2fa/disable', { method: 'POST', body: { code } });
      setTurningOff(false);
      setCode('');
      setMessage({ kind: 'ok', text: 'Verificação desligada.' });
      onChange?.(false);
      await refresh();
    });
  };

  const codeInput = (
    <label>
      Código de 6 dígitos do app
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  );

  return (
    <section className="card" aria-labelledby="dois-fatores">
      <h2 id="dois-fatores">Verificação em duas etapas</h2>
      {forced && (
        <Banner>
          O negócio exige a verificação em duas etapas. Ligue para voltar a usar o painel.
        </Banner>
      )}
      <p className="muted">
        {enabled
          ? 'Ligada: ao entrar, além da senha, o painel pede o código do app autenticador do seu celular.'
          : 'Além da senha, pede um código do app autenticador do celular ao entrar. Protege o painel se alguém descobrir sua senha.'}
      </p>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}
      {setup ? (
        <form className="form" onSubmit={confirm}>
          <ol className="two-factor__steps">
            <li>
              Abra o app autenticador (Google Authenticator, Microsoft Authenticator ou Authy) e
              adicione uma conta.
            </li>
            <li>
              Digite esta chave no app:{' '}
              <code className="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code> ou, no
              celular, <a href={setup.uri}>toque aqui para abrir no app</a>.
            </li>
            <li>Digite abaixo o código que o app mostrar.</li>
          </ol>
          {codeInput}
          <div className="row">
            <button type="submit" className="button" disabled={busy || code.length !== 6}>
              {busy ? 'Conferindo…' : 'Ligar verificação'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setSetup(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : enabled ? (
        turningOff ? (
          <form className="form" onSubmit={disable}>
            {codeInput}
            <div className="row">
              <button type="submit" className="button" disabled={busy || code.length !== 6}>
                Desligar
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setTurningOff(false)}
              >
                Voltar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              setCode('');
              setTurningOff(true);
            }}
          >
            Desligar verificação
          </button>
        )
      ) : (
        <button type="button" className="button" disabled={busy} onClick={() => void start()}>
          Ligar verificação
        </button>
      )}
    </section>
  );
}

/** Tela Configurações (rota /conta): perfil, aparência e segurança, mais o menu do negócio. */
export function Settings({ acting, items }: { acting: boolean; items: SettingsItem[] }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (acting) return;
    let alive = true;
    api<Profile>('/auth/profile')
      .then((p) => {
        if (!alive) return;
        // Resposta fora do formato (API antiga): fica só com tema e senha.
        if (typeof p?.name === 'string' && typeof p.email === 'string') setProfile(p);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [acting]);

  const others = items.filter((i) => i.to !== '/conta');
  return (
    <>
      <PageHeader
        Icon={SettingsIcon}
        title="Configurações"
        subtitle="Sua conta e o jeito que o negócio funciona no painel."
      />
      {others.length > 0 && (
        <nav className="settings__list" aria-label="Mais configurações">
          <SettingsMenu section="/conta" items={others} />
        </nav>
      )}
      {acting ? (
        <p className="muted">Perfil e senha da dona não aparecem durante a entrada da nexo.</p>
      ) : (
        <>
          {failed && <Banner>Não foi possível carregar seu perfil agora.</Banner>}
          {profile && <ProfileCard profile={profile} onSaved={setProfile} />}
        </>
      )}
      <ThemePicker />
      {!acting && (
        <>
          <section className="card">
            <ChangePassword forced={false} />
          </section>
          {profile && (
            <TwoFactorCard
              enabled={profile.twoFactor}
              onChange={(on) => setProfile({ ...profile, twoFactor: on })}
            />
          )}
          {profile && <SessionsCard profile={profile} onChange={setProfile} />}
        </>
      )}
    </>
  );
}
