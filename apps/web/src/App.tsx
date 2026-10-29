import {
  CalendarDays,
  ChartColumn,
  House,
  LogOut,
  SquareKanban,
  UserRound,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import './App.css';
import { MadeByNexo, NexoLogo } from './components/Brand';
import { Sidebar } from './components/Sidebar';
import { Loading } from './components/ui';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { time } from './lib/format';
import { useRoute } from './lib/hooks';
import { setThemePref, type ThemePref, useThemePref } from './lib/theme';
import type { Me } from './lib/types';
import { Admin } from './screens/Admin';
import { Agenda } from './screens/Agenda';
import { ChangePassword } from './screens/ChangePassword';
import { ContactFile } from './screens/ContactFile';
import { Contacts } from './screens/Contacts';
import { ConfirmEmail, ForgotPassword, ResetPassword, Signup } from './screens/AuthPages';
import { Landing } from './screens/Landing';
import { Login } from './screens/Login';
import { Pipeline } from './screens/Pipeline';
import { Plans } from './screens/Plans';
import { Report } from './screens/Report';
import { Setup } from './screens/Setup';
import { TimeOff } from './screens/TimeOff';
import { BotMessages } from './screens/BotMessages';
import { Today } from './screens/Today';

const NAV = [
  { to: '/hoje', label: 'Hoje', Icon: House },
  { to: '/agenda', label: 'Agenda', Icon: CalendarDays },
  { to: '/clientes', label: 'Clientes', Icon: Users },
  { to: '/etapas', label: 'Etapas', Icon: SquareKanban },
  { to: '/resultados', label: 'Resultados', Icon: ChartColumn },
];

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

/** Telas abertas sem login. Os links dos e-mails valem mesmo com alguém logado no aparelho. */
function publicScreen(route: string, loggedIn: boolean): ReactNode {
  const [path, query = ''] = route.split('?');
  const token = new URLSearchParams(query).get('token') ?? '';
  if (path === '/nova-senha') return <ResetPassword token={token} />;
  if (path === '/confirmar-email') return <ConfirmEmail token={token} />;
  if (loggedIn) return null;
  if (path === '/criar-conta') return <Signup />;
  if (path === '/esqueci-senha') return <ForgotPassword />;
  if (path === '/' || path === '') return <Landing />;
  return <Login />;
}

function Shell() {
  const { me, loading, logout } = useAuth();
  const [route] = useRoute();
  const raw = route === '/hoje' && !window.location.hash.replace(/^#/, '') ? '/' : route;
  const open = loading ? null : publicScreen(raw, !!me);

  if (loading) {
    return (
      <div className="app">
        <Loading />
      </div>
    );
  }
  if (open) {
    return raw === '/' ? open : <div className="app app--auth">{open}</div>;
  }
  if (!me) return null;
  if (me.mustChangePassword) {
    return (
      <div className="app app--auth">
        <div className="auth-card">
          <ChangePassword forced />
        </div>
        <MadeByNexo />
      </div>
    );
  }
  if (me.role === 'NEXO_ADMIN' && !me.acting) {
    return (
      <div className="app">
        <header className="appbar">
          <div className="appbar__inner">
            <div className="appbar__title">
              <NexoLogo fundo="escuro" height={28} />
              <span className="appbar__eyebrow">Admin</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Sair"
              onClick={() => void logout()}
            >
              <LogOut aria-hidden="true" size={22} />
            </button>
          </div>
        </header>
        <main>
          <Admin />
        </main>
      </div>
    );
  }
  return <Panel me={me} />;
}

/** Painel do negócio: a dona, ou o admin nexo durante uma entrada registrada. */
function Panel({ me }: { me: Me }) {
  const { logout, refresh } = useAuth();
  const [route, go] = useRoute();

  // A entrada do admin vence sozinha; ao vencer, volta para a área do admin.
  const actingUntil = me.acting?.until;
  useEffect(() => {
    if (!actingUntil) return;
    const ms = new Date(actingUntil).getTime() - Date.now();
    const handle = setTimeout(() => void refresh(), Math.min(Math.max(ms, 0) + 1000, 2 ** 31 - 1));
    return () => clearTimeout(handle);
  }, [actingUntil, refresh]);

  async function endAccess() {
    await api('/admin/access/end', { method: 'POST' }).catch(() => undefined);
    window.location.hash = '';
    await refresh();
  }

  const contactMatch = /^\/clientes\/([0-9a-f-]{36})$/.exec(route);
  const section = '/' + (route.split('/')[1] ?? 'hoje');

  return (
    <div className="app app--with-nav">
      <Sidebar
        businessName={me.businessName ?? 'nexo'}
        items={NAV}
        section={section}
        onLogout={() => void logout()}
      />
      {me.acting && (
        <div className="acting" role="status">
          <span>
            Suporte nexo em <strong>{me.businessName}</strong> até{' '}
            {time(me.acting.until, 'America/Sao_Paulo')}. Tudo fica registrado.
          </span>
          <button type="button" className="button button--small" onClick={() => void endAccess()}>
            Sair do negócio
          </button>
        </div>
      )}
      <header className="appbar">
        <div className="appbar__inner">
          <div className="appbar__title">
            <span className="appbar__eyebrow">Seu painel</span>
            <strong>{me.businessName ?? 'nexo'}</strong>
          </div>
          <a
            href="#/conta"
            className={section === '/conta' ? 'icon-button on' : 'icon-button'}
            aria-label="Conta"
          >
            <UserRound aria-hidden="true" size={22} />
          </a>
          <button
            type="button"
            className="icon-button"
            aria-label="Sair"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" size={22} />
          </button>
        </div>
      </header>
      <main>
        {me.onboardingPending && section !== '/configurar' && (
          <section className="card card--highlight" aria-labelledby="configurar-aviso">
            <h2 id="configurar-aviso">Falta configurar o negócio</h2>
            <p className="muted">
              Cadastre serviços e horários para o robô começar a oferecer horários. Leva poucos
              minutos.
            </p>
            <button
              type="button"
              className="button button--small"
              onClick={() => go('/configurar')}
            >
              Configurar agora
            </button>
          </section>
        )}
        {contactMatch ? (
          <ContactFile id={contactMatch[1]!} go={go} />
        ) : section === '/mensagens' ? (
          <BotMessages go={go} />
        ) : section === '/folgas' ? (
          <TimeOff go={go} />
        ) : section === '/configurar' ? (
          <Setup go={go} />
        ) : section === '/assinatura' ? (
          <Plans go={go} />
        ) : section === '/conta' ? (
          <Account go={go} acting={Boolean(me.acting)} />
        ) : section === '/agenda' ? (
          <Agenda go={go} />
        ) : section === '/clientes' ? (
          <Contacts go={go} />
        ) : section === '/etapas' ? (
          <Pipeline go={go} />
        ) : section === '/resultados' ? (
          <Report />
        ) : (
          <Today go={go} />
        )}
      </main>
      <MadeByNexo />
      <nav className="tabbar" aria-label="Seções do painel">
        {NAV.map(({ to, label, Icon }) => (
          <a
            key={to}
            href={`#${to}`}
            aria-current={section === to ? 'page' : undefined}
            className={section === to ? 'on' : ''}
          >
            <span className="tabbar__icon">
              <Icon aria-hidden="true" size={22} strokeWidth={section === to ? 2.4 : 2} />
            </span>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
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
      <p className="muted">Escolha as cores do painel neste aparelho.</p>
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
    </section>
  );
}

function Account({ go, acting }: { go: (to: string) => void; acting: boolean }) {
  return (
    <>
      <header className="page-header">
        <h1>Conta</h1>
      </header>
      <section className="section stack">
        <button type="button" className="button button--ghost" onClick={() => go('/configurar')}>
          Configurar o negócio (serviços, horários, dúvidas)
        </button>
        <button type="button" className="button button--ghost" onClick={() => go('/mensagens')}>
          Mensagens do robô
        </button>
        <button type="button" className="button button--ghost" onClick={() => go('/folgas')}>
          Folgas e bloqueios
        </button>
        <button type="button" className="button button--ghost" onClick={() => go('/assinatura')}>
          Plano e assinatura
        </button>
      </section>
      <ThemePicker />
      {!acting && (
        <section className="card">
          <ChangePassword forced={false} />
        </section>
      )}
    </>
  );
}
