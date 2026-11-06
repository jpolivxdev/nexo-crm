import {
  CalendarDays,
  ChartColumn,
  Compass,
  House,
  LogOut,
  MessagesSquare,
  SquareKanban,
  UserRound,
  Users,
} from 'lucide-react';
import { PageHeader } from './components/PageHeader';
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
import { markTourSeen, tourFor, tourSeen } from './lib/tours';
import { setThemePref, type ThemePref, useThemePref } from './lib/theme';
import type { Feature, Me } from './lib/types';
import { Admin } from './screens/Admin';
import { Alerts } from './screens/Alerts';
import { Agenda } from './screens/Agenda';
import { ChangePassword } from './screens/ChangePassword';
import { ContactFile } from './screens/ContactFile';
import { Contacts } from './screens/Contacts';
import { Conversations } from './screens/Conversations';
import { ConfirmEmail, ForgotPassword, ResetPassword, Signup } from './screens/AuthPages';
import { Landing } from './screens/Landing';
import { Login } from './screens/Login';
import { Pipeline } from './screens/Pipeline';
import { NotInPlan, Plans } from './screens/Plans';
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
  '/agenda': { feature: 'agenda', name: 'A agenda' },
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

  // Profissional da equipe: só a própria agenda (o servidor também barra o resto).
  const staff = me.role === 'STAFF';
  // Sem a lista (versão antiga da API), mostra tudo e deixa o servidor decidir.
  const has = (f: Feature) => !me.features || me.features.includes(f);
  const nav = (staff ? NAV.filter((n) => n.to === '/hoje' || n.to === '/agenda') : NAV).filter(
    (n) => !n.feature || has(n.feature),
  );
  const rawSection = '/' + (route.split('/')[1] ?? 'hoje');
  const section =
    staff && !['/hoje', '/agenda', '/conta'].includes(rawSection) ? '/hoje' : rawSection;
  const contactMatch = staff ? null : /^\/clientes\/([0-9a-f-]{36})$/.exec(route);
  const conversationMatch = /^\/conversas\/([0-9a-f-]{36})$/.exec(route);

  // Tour guiado: abre sozinho uma vez por aparelho (fora dos testes) e pela bússola do topo.
  const [touring, setTouring] = useState(
    () => import.meta.env.MODE !== 'test' && !tourSeen() && !me.acting,
  );
  function closeTour() {
    markTourSeen();
    setTouring(false);
  }
  function openTour(to?: string) {
    if (to && to !== section) go(to);
    // Espera a tela nova aparecer antes de procurar as partes que o tour destaca.
    window.setTimeout(() => setTouring(true), to && to !== section ? 300 : 0);
  }
  const allowed = new Set(nav.map((n) => n.to));
  const nexTopics = NEX_TOPICS.filter((t) => allowed.has(t.to));

  return (
    <div className="app app--with-nav">
      <Sidebar
        businessName={me.businessName ?? 'nexo'}
        items={nav}
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
            className={section === '/conta' ? 'icon-button on' : 'icon-button'}
            aria-label="Conta"
            data-tour="conta"
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
        {SECTION_FEATURE[section] && !has(SECTION_FEATURE[section].feature) ? (
          <NotInPlan go={go} name={SECTION_FEATURE[section].name} />
        ) : contactMatch ? (
          <ContactFile id={contactMatch[1]!} go={go} />
        ) : section === '/avisos' ? (
          <Alerts go={go} />
        ) : section === '/equipe' ? (
          <Team go={go} />
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
          <Account go={go} acting={Boolean(me.acting)} staff={staff} />
        ) : section === '/agenda' ? (
          <Agenda go={go} staff={staff} />
        ) : section === '/conversas' ? (
          <Conversations id={conversationMatch?.[1] ?? null} go={go} />
        ) : section === '/clientes' ? (
          <Contacts go={go} />
        ) : section === '/etapas' ? (
          <Pipeline go={go} />
        ) : section === '/resultados' ? (
          <Report />
        ) : (
          <Today go={go} staff={staff} />
        )}
      </main>
      <MadeByNexo />
      <Nex topics={nexTopics} onTour={openTour} />
      {touring && <Tour key={section} steps={tourFor(section)} onClose={closeTour} />}
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

function Account({
  go,
  acting,
  staff,
}: {
  go: (to: string) => void;
  acting: boolean;
  staff: boolean;
}) {
  return (
    <>
      <PageHeader
        Icon={UserRound}
        title="Conta"
        subtitle="Sua senha, o tema da tela e o que mais é seu."
      />
      {!staff && (
        <section className="section stack">
          <button type="button" className="button button--ghost" onClick={() => go('/configurar')}>
            Configurar o negócio (serviços, horários, dúvidas)
          </button>
          <button type="button" className="button button--ghost" onClick={() => go('/equipe')}>
            Equipe (profissionais e acessos)
          </button>
          <button type="button" className="button button--ghost" onClick={() => go('/avisos')}>
            Avisos e lembrete do próximo horário
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
      )}
      <ThemePicker />
      {!acting && (
        <section className="card">
          <ChangePassword forced={false} />
        </section>
      )}
    </>
  );
}
