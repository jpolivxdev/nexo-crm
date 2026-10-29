import './App.css';
import { Loading } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { useRoute } from './lib/hooks';
import { Agenda } from './screens/Agenda';
import { ContactFile } from './screens/ContactFile';
import { Contacts } from './screens/Contacts';
import { Login } from './screens/Login';
import { Pipeline } from './screens/Pipeline';
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
  const [route, go] = useRoute();

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
  if (me.role === 'NEXO_ADMIN') {
    return (
      <div className="app">
        <main>
          <h1>Admin nexo</h1>
          <p>A área do admin chega numa próxima entrega.</p>
          <button type="button" className="button button--ghost" onClick={() => void logout()}>
            Sair
          </button>
        </main>
      </div>
    );
  }

  const contactMatch = /^\/clientes\/([0-9a-f-]{36})$/.exec(route);
  const section = '/' + (route.split('/')[1] ?? 'hoje');

  return (
    <div className="app app--with-nav">
      <div className="topbar">
        <span className="brand">nexo</span>
        <button type="button" className="link" onClick={() => void logout()}>
          Sair
        </button>
      </div>
      <main>
        {contactMatch ? (
          <ContactFile id={contactMatch[1]!} go={go} />
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
