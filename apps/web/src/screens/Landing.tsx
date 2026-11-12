import { ArrowRight, Menu, PlayCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MadeByNexo, NexoLogo } from '../components/Brand';
import panelPreview from '../assets/painel-exemplo.webp';
import { useAuthOptions } from './AuthPages';
import { Phone } from '../components/Phone';
import {
  AGENDA_LABEL,
  AgendaScreen,
  Facts,
  Faq,
  FinalCta,
  ForWhom,
  Orbit,
  PlansSection,
  Steps,
} from '../components/LandingSections';
import '../styles/landing.css';

/** Seções da página. Rolam até o lugar sem mexer no endereço (o painel usa o # para as rotas). */
const SECTIONS = [
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'no-whatsapp', label: 'No WhatsApp' },
  { id: 'planos', label: 'Planos' },
  { id: 'perguntas', label: 'Perguntas' },
];

function scrollTo(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/**
 * Abertura ligada à rolagem: põe em `--lp-p` (0 a 1) quanto da abertura já rolou. O CSS usa isso
 * para o celular subir e passar por trás do título. Feito à mão (sem GSAP nem Lenis): a rolagem
 * continua a do navegador. Com "reduzir movimento", fica parado no fim.
 */
function useHeroProgress() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (reduce?.matches) {
        hero.style.setProperty('--lp-p', '1');
        return;
      }
      const room = Math.max(1, hero.offsetHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / room));
      hero.style.setProperty('--lp-p', p.toFixed(3));
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
 * Página de entrada. Layout inspirado num modelo de site do Modulify (só a estrutura: abertura
 * escura com título gigante e celular, mosaico, título fixo com fatos ao lado, virada para o
 * claro), com textos, telas e cores da nexo. Usa a largura toda da tela.
 */
export function Landing() {
  const options = useAuthOptions();
  const [menuOpen, setMenuOpen] = useState(false);
  const signup = options?.signupEnabled ?? false;
  const heroRef = useHeroProgress();
  const active = useActiveSection(SECTIONS.map((s) => s.id));

  const go = (id: string) => {
    setMenuOpen(false);
    scrollTo(id);
  };

  const actions = (
    <>
      <a href="#/entrar" className="lp-button lp-button--ghost">
        Entrar
      </a>
      {signup && (
        <a href="#/criar-conta" className="lp-button lp-button--ghost">
          Criar conta
        </a>
      )}
      <a href="#/demo" className="lp-button lp-button--light">
        Demo
      </a>
    </>
  );

  return (
    <div className="lp">
      <header className="lp-nav">
        <nav className="lp-nav__inner" aria-label="Principal">
          <NexoLogo fundo="escuro" height={26} />
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
        <section ref={heroRef} className="lp-open">
          <div className="lp-open__stage">
            <div className="lp-open__glow" aria-hidden="true" />
            <p className="lp-pill">
              <span>Em fase de testes</span>
              <button type="button" className="lp-pill__link" onClick={() => go('como-funciona')}>
                Ver como funciona
                <ArrowRight aria-hidden="true" size={12} />
              </button>
            </p>
            <h1 className="lp-open__title">
              <span className="lp-open__word">Seu cliente marca horário</span>{' '}
              <span className="lp-open__word lp-open__word--cor">sozinho pelo WhatsApp</span>
            </h1>
            <Phone className="phone--hero" label={AGENDA_LABEL}>
              <AgendaScreen />
            </Phone>
            <div className="lp-open__foot">
              <p className="lp-open__lead">
                Até de madrugada. E você vê agenda, clientes e conversas do seu negócio organizados
                num lugar só, direto do celular.
              </p>
              <div className="lp-open__cta">
                <a href="#/demo" className="lp-button lp-button--gradient lp-button--lg">
                  <PlayCircle aria-hidden="true" size={18} />
                  Ver a demonstração
                </a>
                <a href="#/entrar" className="lp-button lp-button--secondary lp-button--lg">
                  Entrar no painel
                  <ArrowRight aria-hidden="true" size={18} />
                </a>
              </div>
              <p className="lp-open__note">
                A demonstração abre o painel com um negócio e clientes fictícios, sem cadastro.
              </p>
            </div>
          </div>
        </section>

        <Steps preview={panelPreview} />
        <Orbit />
        <Facts />

        <div className="lp-claro">
          <div className="lp-claro__fundo" aria-hidden="true" />
          <PlansSection signup={signup} />

          <ForWhom />

          <Faq />
          <FinalCta />

          <footer className="lp-footer">
            <MadeByNexo fundo="claro" />
          </footer>
        </div>
      </main>
    </div>
  );
}
