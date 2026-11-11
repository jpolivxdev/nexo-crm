import {
  ArrowRight,
  CalendarCheck,
  Hand,
  Menu,
  MessageCircle,
  PlayCircle,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MadeByNexo, NexoLogo } from '../components/Brand';
import { NICHES } from '../lib/niches';
import panelPreview from '../assets/painel-exemplo.webp';
import nexoSymbol from '../assets/brand/nexo-simbolo-fundo-escuro.svg';
import { useAuthOptions } from './AuthPages';
import {
  ChatPreview,
  Faq,
  FinalCta,
  Highlights,
  PlansSection,
} from '../components/LandingSections';
import '../styles/landing.css';

/** Seções da página. Rolam até o lugar sem mexer no endereço (o painel usa o # para as rotas). */
const SECTIONS = [
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'no-whatsapp', label: 'No WhatsApp' },
  { id: 'planos', label: 'Planos' },
  { id: 'perguntas', label: 'Perguntas' },
];

const STEPS = [
  {
    Icon: MessageCircle,
    title: 'O cliente marca pelo WhatsApp',
    text: 'O robô responde na hora, até de madrugada, e só oferece os horários livres.',
  },
  {
    Icon: CalendarCheck,
    title: 'O horário cai na sua agenda',
    text: 'Você vê o dia no celular e marca "realizado" ou "faltou" com um toque.',
  },
  {
    Icon: Users,
    title: 'A ficha do cliente se monta sozinha',
    text: 'Conversas, horários e faltas de cada cliente num lugar só, sem digitar nada.',
  },
  {
    Icon: Hand,
    title: 'Você no controle',
    text: 'Quando o cliente pede para falar com você, o robô pausa e te avisa.',
  },
];

function scrollTo(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/**
 * Camadas do topo que andam em velocidades diferentes ao rolar (ideia do "parallax scrolling"
 * da Osmo, feita aqui sem GSAP nem Lenis: a rolagem continua a do navegador). Põe quanto o topo
 * já rolou em `--lp-rolagem`; o CSS move cada camada por uma fração disso. Com "reduzir
 * movimento", nada se mexe.
 */
function useParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const paint = () => {
      raf = 0;
      const y = reduce?.matches
        ? 0
        : Math.max(0, Math.min(window.scrollY, window.innerHeight * 1.5));
      root.style.setProperty('--lp-rolagem', String(Math.round(y)));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

/** Qual seção está na tela, para a gota do menu de cima acompanhar a rolagem. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        setActive(key.split(',').find((id) => seen.get(id)) ?? null);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    key.split(',').forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [key]);
  return active;
}

/**
 * Página de entrada (estilo do modelo de SaaS do 21st.dev, com as cores e fontes da nexo), com o
 * topo em camadas que rolam em velocidades diferentes e o mesmo vidro e gota do painel.
 */
export function Landing() {
  const options = useAuthOptions();
  const [menuOpen, setMenuOpen] = useState(false);
  const signup = options?.signupEnabled ?? false;
  const pageRef = useParallax();
  const active = useActiveSection(SECTIONS.map((s) => s.id));

  const go = (id: string) => {
    setMenuOpen(false);
    scrollTo(id);
  };

  const actions = (
    <>
      <a href="#/demo" className="lp-button lp-button--ghost">
        Demo
      </a>
      <a href="#/entrar" className="lp-button lp-button--ghost">
        Entrar
      </a>
      {signup && (
        <a href="#/criar-conta" className="lp-button lp-button--light">
          Criar conta
        </a>
      )}
    </>
  );

  return (
    <div className="lp" ref={pageRef}>
      <header className="lp-nav">
        <nav className="lp-nav__inner" aria-label="Principal">
          <NexoLogo fundo="escuro" height={28} />
          <div className="lp-nav__links">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`lp-nav__link${active === s.id ? ' on' : ''}`}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={() => go(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="lp-nav__actions">{actions}</div>
          <button
            type="button"
            className="lp-nav__toggle"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
          </button>
        </nav>
        {menuOpen && (
          <div id="lp-menu" className="lp-nav__menu">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className="lp-nav__link" onClick={() => go(s.id)}>
                {s.label}
              </button>
            ))}
            <div className="lp-nav__menu-actions">{actions}</div>
          </div>
        )}
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-layers" aria-hidden="true">
            <div className="lp-layer lp-layer--manchas" />
            <img className="lp-layer lp-layer--simbolo" src={nexoSymbol} alt="" />
          </div>
          <div className="lp-hero__copy">
            <p className="lp-pill">
              <span>Em fase de testes</span>
              <button type="button" className="lp-pill__link" onClick={() => go('como-funciona')}>
                Ver como funciona
                <ArrowRight aria-hidden="true" size={12} />
              </button>
            </p>
            <h1 className="lp-hero__title">
              Seu cliente marca horário <br className="lp-br" />
              sozinho pelo WhatsApp
            </h1>
            <p className="lp-hero__lead">
              Até de madrugada. E você vê agenda, clientes e conversas do seu negócio organizados
              num lugar só, direto do celular.
            </p>
            <div className="lp-hero__cta">
              <a href="#/demo" className="lp-button lp-button--gradient lp-button--lg">
                <PlayCircle aria-hidden="true" size={18} />
                Ver a demonstração
              </a>
              <a href="#/entrar" className="lp-button lp-button--secondary lp-button--lg">
                Entrar no painel
                <ArrowRight aria-hidden="true" size={18} />
              </a>
            </div>
            <p className="lp-hero__note">
              A demonstração abre o painel com um negócio e clientes fictícios, sem cadastro.
            </p>
          </div>
          <figure className="lp-preview">
            <div className="lp-preview__glow" aria-hidden="true" />
            <img
              src={panelPreview}
              alt="Tela do painel com a agenda do dia de um negócio de exemplo"
              width={1280}
              height={800}
            />
            <figcaption>Painel com dados de exemplo (fictícios).</figcaption>
          </figure>
          <div className="lp-hero__fade" aria-hidden="true" />
        </section>

        <section id="como-funciona" className="lp-section lp-reveal">
          <h2>Como funciona</h2>
          <ol className="lp-steps">
            {STEPS.map(({ Icon, title, text }) => (
              <li key={title} className="lp-step">
                <Icon aria-hidden="true" size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <ChatPreview />
        <Highlights />
        <PlansSection signup={signup} />

        <section id="para-quem" className="lp-section lp-reveal">
          <h2>Para quem é</h2>
          <p className="lp-section__lead">
            Pequenos negócios que marcam horário e atendem pelo WhatsApp.
          </p>
          <ul className="lp-niches">
            {NICHES.filter((n) => n.value !== 'outro').map((n) => (
              <li key={n.value}>{n.label}</li>
            ))}
          </ul>
        </section>

        <Faq />
        <FinalCta />
      </main>

      <footer className="lp-footer">
        <MadeByNexo fundo="escuro" />
      </footer>
    </div>
  );
}
