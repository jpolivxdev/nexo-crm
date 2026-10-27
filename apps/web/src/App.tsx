import { useEffect } from 'react';
import './App.css';
import { Loading } from './components/ui';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { time } from './lib/format';
import { useRoute } from './lib/hooks';
import type { Me } from './lib/types';
import { Admin } from './screens/Admin';
import { Agenda } from './screens/Agenda';
import { ChangePassword } from './screens/ChangePassword';
import { ContactFile } from './screens/ContactFile';
import { Contacts } from './screens/Contacts';
import { Login } from './screens/Login';
import { Pipeline } from './screens/Pipeline';
import { Setup } from './screens/Setup';
import { Today } from './screens/Today';

const NAV = [
  { to: '/hoje', label: 'Hoje' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/etapas', label: 'Etapas' },
];

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { me, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <Loading />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="app">
        <Login />
        <footer className="app__footer">feito pela nexo</footer>
      </div>
    );
  }
  if (me.mustChangePassword) {
    return (
      <div className="app">
        <ChangePassword forced />
        <footer className="app__footer">feito pela nexo</footer>
      </div>
    );
  }
  if (me.role === 'NEXO_ADMIN' && !me.acting) {
    return (
      <div className="app">
        <div className="topbar">
          <span className="brand">nexo · admin</span>
          <button type="button" className="link" onClick={() => void logout()}>
            Sair
          </button>
        </div>
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
      <div className="topbar">
        <span className="brand">{me.businessName ?? 'nexo'}</span>
        <div className="row">
          <a href="#/conta" className="link">
            Conta
          </a>
          <button type="button" className="link" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </div>
      <main>
        {me.onboardingPending && section !== '/configurar' && (
          <section className="card card--attention" aria-labelledby="configurar-aviso">
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
        ) : section === '/configurar' ? (
          <Setup go={go} />
        ) : section === '/conta' ? (
          <Account go={go} acting={Boolean(me.acting)} />
        ) : section === '/agenda' ? (
          <Agenda go={go} />
        ) : section === '/clientes' ? (
          <Contacts go={go} />
        ) : section === '/etapas' ? (
          <Pipeline go={go} />
        ) : (
          <Today go={go} />
        )}
      </main>
      <footer className="app__footer">feito pela nexo</footer>
      <nav className="tabbar" aria-label="Seções do painel">
        {NAV.map((item) => (
          <a
            key={item.to}
            href={`#${item.to}`}
            aria-current={section === item.to ? 'page' : undefined}
            className={section === item.to ? 'on' : ''}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Account({ go, acting }: { go: (to: string) => void; acting: boolean }) {
  return (
    <>
      <header className="page-header">
        <h1>Conta</h1>
      </header>
      <section className="section">
        <button type="button" className="button button--ghost" onClick={() => go('/configurar')}>
          Configurar o negócio (serviços, horários, dúvidas)
        </button>
      </section>
      {!acting && (
        <section className="card">
          <ChangePassword forced={false} />
        </section>
      )}
    </>
  );
}
