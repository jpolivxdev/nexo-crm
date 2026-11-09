import {
  CalendarDays,
  ChartColumn,
  Compass,
  House,
  LogOut,
  MessagesSquare,
  Repeat2,
  SquareKanban,
  Settings as Settings2,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import './App.css';
import { Bell } from './components/Bell';
import { MadeByNexo, NexoLogo } from './components/Brand';
import { Nex, type NexTopic } from './components/Nex';
import { OwnerToasts } from './components/OwnerToasts';
import { Sidebar, type SidebarItem } from './components/Sidebar';
import { Tour } from './components/Tour';
import { Loading } from './components/ui';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { time } from './lib/format';
import { useRoute } from './lib/hooks';
import { DEMO_TOUR, markTourSeen, tourFor, tourSeen } from './lib/tours';
import { enterDemo, isDemo, leaveDemo, takeDemoTour } from './lib/demo/mode';
import { DemoBanner } from './components/DemoBanner';
import type { AccessArea } from './lib/roles';
import type { Feature, Me } from './lib/types';
import { AccessByRole } from './screens/AccessByRole';
import { Admin } from './screens/Admin';
import { AdminSupport } from './screens/AdminSupport';
import { Support } from './screens/Support';
import { Alerts } from './screens/Alerts';
import { Agenda } from './screens/Agenda';
import { ChangePassword } from './screens/ChangePassword';
import {
  Settings,
  SETTINGS,
  SETTINGS_ROUTES,
  SettingsLayout,
  TwoFactorCard,
} from './screens/Settings';
import { ContactFile } from './screens/ContactFile';
import { Contacts } from './screens/Contacts';
import { Conversations } from './screens/Conversations';
import { ConfirmEmail, ForgotPassword, ResetPassword, Signup } from './screens/AuthPages';
import { Landing } from './screens/Landing';
import { Login } from './screens/Login';
import { Pipeline } from './screens/Pipeline';
import { Portfolio } from './screens/Portfolio';
import { NoAccess, NotInPlan, Plans } from './screens/Plans';
import { Report } from './screens/Report';
import { Setup } from './screens/Setup';
import { TimeOff } from './screens/TimeOff';
import { BotMessages } from './screens/BotMessages';
import { StageRules } from './screens/StageRules';
import { Team } from './screens/Team';
import { Today } from './screens/Today';

const NAV: (SidebarItem & { feature?: Feature })[] = [
  { to: '/hoje', label: 'Hoje', Icon: House, hint: 'O resumo do dia e o que precisa de você' },
  {
    to: '/agenda',
    label: 'Agenda',
    Icon: CalendarDays,
    feature: 'agenda',
    group: 'Atendimento',
    hint: 'Horários marcados por dia, semana ou mês',
  },
  {
    to: '/conversas',
    label: 'Conversas',
    Icon: MessagesSquare,
    group: 'Atendimento',
    hint: 'Quem chamou no WhatsApp; responda por aqui',
  },
  {
    to: '/clientes',
    label: 'Clientes',
    Icon: Users,
    group: 'Atendimento',
    hint: 'Ficha de cada cliente, frequentes e sumidas',
  },
  {
    to: '/carteira',
    label: 'Carteira',
    Icon: Repeat2,
    feature: 'contacts_plus',
    group: 'Atendimento',
    hint: 'Quem volta sempre e quem está em risco de sumir',
  },
  {
    to: '/etapas',
    label: 'Etapas',
    Icon: SquareKanban,
    group: 'Atendimento',
    hint: 'Onde cada cliente está, do contato ao retorno',
  },
  {
    to: '/resultados',
    label: 'Resultados',
    Icon: ChartColumn,
    feature: 'report',
    group: 'Gestão',
    hint: 'Números do mês: horários, faltas e retornos',
  },
];

/** Seções que dependem do plano (o servidor também barra). */
const SECTION_FEATURE: Record<string, { feature: Feature; name: string }> = {
  '/acessos': { feature: 'team_roles', name: 'Acessos por papel' },
  '/agenda': { feature: 'agenda', name: 'A agenda' },
  '/carteira': { feature: 'contacts_plus', name: 'A Carteira de clientes' },
  '/folgas': { feature: 'agenda', name: 'Folgas e bloqueios' },
  '/resultados': { feature: 'report', name: 'Resultados' },
};

/** Atalhos do Nex: cada um abre a tela e o tour dela. */
const NEX_TOPICS: NexTopic[] = [
  { label: 'Como marcar um horário', to: '/agenda' },
  { label: 'Como respondo uma cliente', to: '/conversas' },
  { label: 'Onde vejo minhas clientes', to: '/clientes' },
  { label: 'Como mudar a etapa de uma cliente', to: '/etapas' },
  { label: 'Onde vejo meus números', to: '/resultados' },
  { label: 'Como falo com a nexo', to: '/suporte' },
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
  if (path === '/demo') return <DemoStart />;
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
  if (me.mfaSetupRequired) {
    return (
      <div className="app app--auth">
        <div className="auth-card">
          <TwoFactorCard enabled={false} forced />
          <button type="button" className="link" onClick={() => void logout()}>
            Sair
          </button>
        </div>
        <MadeByNexo />
      </div>
    );
  }
  if (me.role === 'NEXO_ADMIN' && !me.acting) {
    const adminSupport = raw.startsWith('/suporte');
    const ticket = /^\/suporte\/([0-9a-f-]{36})$/.exec(raw)?.[1] ?? null;
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
          <nav className="admin-nav" aria-label="Área do admin">
            <a href="#/admin" aria-current={adminSupport ? undefined : 'page'}>
              Negócios
            </a>
            <a href="#/suporte" aria-current={adminSupport ? 'page' : undefined}>
              Suporte
            </a>
          </nav>
        </header>
        <main>
          {adminSupport ? (
            <AdminSupport id={ticket} go={(to) => (window.location.hash = to)} />
          ) : (
            <Admin />
          )}
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

  // Profissional da equipe: só a própria agenda (o servidor também barra o resto).
  const staff = me.role === 'STAFF';
  // Sem a lista (versão antiga da API), mostra tudo e deixa o servidor decidir.
  const has = (f: Feature) => !me.features || me.features.includes(f);
  // Dono (ou a nexo numa entrada controlada) vê tudo; gestor e consultor seguem os Acessos.
  const owner = me.role === 'OWNER' || Boolean(me.acting);
  const canArea = (area: AccessArea) => owner || !me.access || me.access.includes(area);
  const allowedSection = (to: string) => {
    const item = SETTINGS.find((i) => i.to === to);
    if (item?.needs === 'owner') return owner;
    if (item?.needs === 'settings' || to === '/regras') return canArea('settings');
    if (to === '/resultados') return canArea('reports');
    return true;
  };
  const nav = (staff ? NAV.filter((n) => n.to === '/hoje' || n.to === '/agenda') : NAV).filter(
    (n) => (!n.feature || has(n.feature)) && allowedSection(n.to),
  );
  const rawSection = '/' + (route.split('/')[1] ?? 'hoje');
  const section =
    staff && !['/hoje', '/agenda', '/conta'].includes(rawSection) ? '/hoje' : rawSection;
  const contactMatch = staff ? null : /^\/clientes\/([0-9a-f-]{36})$/.exec(route);
  const conversationMatch = /^\/conversas\/([0-9a-f-]{36})$/.exec(route);
  const supportMatch = /^\/suporte\/([0-9a-f-]{36})$/.exec(route);

  // Tour guiado: abre sozinho uma vez por aparelho (fora dos testes) e pela bússola do topo.
  const [touring, setTouring] = useState(
    () => import.meta.env.MODE !== 'test' && !tourSeen() && !me.acting && !isDemo(),
  );
  // Demonstração: o tour geral passa pelas telas principais e abre sozinho ao entrar.
  const demo = isDemo();
  const [demoTouring, setDemoTouring] = useState(() => demo && takeDemoTour());
  function closeTour() {
    markTourSeen();
    setTouring(false);
  }
  function openTour(to?: string) {
    if (to && to !== section) go(to);
    // Espera a tela nova aparecer antes de procurar as partes que o tour destaca.
    window.setTimeout(() => setTouring(true), to && to !== section ? 300 : 0);
  }
  const allowed = new Set([...nav.map((n) => n.to), ...(staff ? [] : ['/suporte'])]);
  const nexTopics = NEX_TOPICS.filter((t) => allowed.has(t.to));

  const settingsItems = SETTINGS.filter(
    (i) =>
      (!staff || i.to === '/conta') &&
      allowedSection(i.to) &&
      (!SECTION_FEATURE[i.to] || has(SECTION_FEATURE[i.to]!.feature)),
  );
  const inSettings = SETTINGS_ROUTES.has(section) && !staff;
  const content = !allowedSection(section) ? (
    <NoAccess go={go} />
  ) : SECTION_FEATURE[section] && !has(SECTION_FEATURE[section].feature) ? (
    <NotInPlan go={go} name={SECTION_FEATURE[section].name} />
  ) : contactMatch ? (
    <ContactFile id={contactMatch[1]!} go={go} />
  ) : section === '/avisos' ? (
    <Alerts go={go} />
  ) : section === '/equipe' ? (
    <Team go={go} />
  ) : section === '/acessos' ? (
    <AccessByRole go={go} />
  ) : section === '/regras' ? (
    <StageRules go={go} />
  ) : section === '/mensagens' ? (
    <BotMessages go={go} />
  ) : section === '/folgas' ? (
    <TimeOff go={go} />
  ) : section === '/configurar' ? (
    <Setup go={go} />
  ) : section === '/assinatura' ? (
    <Plans go={go} />
  ) : section === '/conta' ? (
    <Settings acting={Boolean(me.acting)} items={settingsItems} />
  ) : section === '/agenda' ? (
    <Agenda go={go} staff={staff} />
  ) : section === '/suporte' && !staff ? (
    <Support id={supportMatch?.[1] ?? null} go={go} />
  ) : section === '/conversas' ? (
    <Conversations id={conversationMatch?.[1] ?? null} go={go} />
  ) : section === '/clientes' ? (
    <Contacts go={go} canTransfer={has('contacts_plus') && canArea('privacy')} />
  ) : section === '/carteira' ? (
    <Portfolio go={go} canSettings={canArea('settings')} />
  ) : section === '/etapas' ? (
    <Pipeline
      go={go}
      crm={
        me.features?.includes('crm_plus')
          ? {
              userId: me.userId ?? null,
              owner,
              canSettings: canArea('settings'),
              canExport: canArea('privacy'),
            }
          : undefined
      }
    />
  ) : section === '/resultados' ? (
    <Report />
  ) : (
    <Today go={go} staff={staff} />
  );

  return (
    <div className="app app--with-nav">
      <Sidebar
        businessName={me.businessName ?? 'nexo'}
        items={nav}
        section={
          inSettings && section !== '/assinatura' && section !== '/suporte' ? '/conta' : section
        }
        onLogout={() => void logout()}
      />
      {demo && (
        <DemoBanner
          onTour={() => setDemoTouring(true)}
          onLeave={(to) => {
            leaveDemo();
            window.location.hash = to;
            void refresh();
          }}
        />
      )}
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
          <button
            type="button"
            className="icon-button"
            aria-label="Ver o tour desta tela"
            data-tour="tour"
            onClick={() => openTour()}
          >
            <Compass aria-hidden="true" size={22} />
          </button>
          {!staff && <Bell go={go} />}
          <a
            href="#/conta"
            className={inSettings || section === '/conta' ? 'icon-button on' : 'icon-button'}
            aria-label="Configurações"
            data-tour="conta"
          >
            <Settings2 aria-hidden="true" size={22} />
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
      {!staff && <OwnerToasts go={go} />}
      <main>
        {me.onboardingPending && !staff && section !== '/configurar' && (
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
        {inSettings ? (
          <SettingsLayout section={section} items={settingsItems}>
            {content}
          </SettingsLayout>
        ) : (
          content
        )}
      </main>
      <MadeByNexo />
      <Nex topics={nexTopics} onTour={openTour} />
      {touring && <Tour key={section} steps={tourFor(section)} onClose={closeTour} />}
      {demoTouring && <Tour steps={DEMO_TOUR} onClose={() => setDemoTouring(false)} onRoute={go} />}
      <nav className="tabbar" aria-label="Seções do painel">
        {nav.map(({ to, label, Icon }) => (
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

/** Entra na demonstração: liga o modo demo, lê a "sessão" fictícia e abre o Hoje. */
function DemoStart() {
  const { refresh } = useAuth();
  useEffect(() => {
    enterDemo();
    void refresh().then(() => {
      window.location.hash = '/hoje';
    });
  }, [refresh]);
  return <Loading />;
}
