import {
  ArrowRight,
  CalendarCheck,
  Check,
  Hand,
  Menu,
  MessageCircle,
  PlayCircle,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { MadeByNexo, NexoLogo } from '../components/Brand';
import { NICHES } from '../lib/niches';
import panelPreview from '../assets/painel-exemplo.webp';
import { useAuthOptions } from './AuthPages';

/** Seções da página. Rolam até o lugar sem mexer no endereço (o painel usa o # para as rotas). */
const SECTIONS = [
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'planos', label: 'Planos' },
  { id: 'para-quem', label: 'Para quem é' },
];

/**
 * Os dois planos (decisão do JP em 09/11/2026). Preço ainda [A DEFINIR] com o Coca: a página não
 * mostra valor inventado. O Premium está em construção e só lista o que está planejado.
 */
const BASIC = [
  'Robô que marca, remarca e cancela pelo WhatsApp, 24 horas',
  'Agenda no celular, com folgas e lembretes',
  'Conversas do WhatsApp num lugar só',
  'Clientes e etapas que se organizam sozinhos',
  'Resultados e metas do mês',
  'Nex, guia de uso, e suporte direto com a nexo',
];

const PREMIUM = [
  'Tudo do Básico',
  'Vários funis e campos do seu jeito',
  'Painéis com metas e previsão de receita',
  'Importar e exportar clientes',
  'Sua marca no painel',
  'Acessos por função na equipe',
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
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Página de entrada (estilo do modelo de SaaS do 21st.dev, com as cores e fontes da nexo). */
export function Landing() {
  const options = useAuthOptions();
  const [menuOpen, setMenuOpen] = useState(false);
  const signup = options?.signupEnabled ?? false;

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
    <div className="lp">
      <header className="lp-nav">
        <nav className="lp-nav__inner" aria-label="Principal">
          <NexoLogo fundo="escuro" height={28} />
          <div className="lp-nav__links">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className="lp-nav__link" onClick={() => go(s.id)}>
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
            Até de madrugada. E você vê agenda, clientes e conversas do seu negócio organizados num
            lugar só, direto do celular.
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
        </section>

        <section id="como-funciona" className="lp-section">
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

        <section id="planos" className="lp-section">
          <h2>Planos</h2>
          <p className="lp-section__lead">Comece pelo Básico. O Premium está em construção.</p>
          <div className="lp-plans">
            <article className="lp-plan lp-plan--main" aria-labelledby="plano-basico">
              <p className="lp-plan__tag">Disponível</p>
              <h3 id="plano-basico">Básico</h3>
              <p className="lp-plan__lead">
                Atendimento automático pelo WhatsApp e um painel simples para organizar o dia.
              </p>
              <p className="lp-plan__price">Valor em breve</p>
              <ul className="lp-plan__list">
                {BASIC.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" size={18} />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="lp-plan__cta">
                <a href="#/demo" className="lp-button lp-button--gradient">
                  <PlayCircle aria-hidden="true" size={18} />
                  Demo
                </a>
                {signup && (
                  <a href="#/criar-conta" className="lp-button lp-button--secondary">
                    Criar conta
                  </a>
                )}
              </div>
            </article>
            <article className="lp-plan" aria-labelledby="plano-premium">
              <p className="lp-plan__tag lp-plan__tag--soon">Em construção</p>
              <h3 id="plano-premium">Premium</h3>
              <p className="lp-plan__lead">
                Para quem tem equipe e quer acompanhar metas e receita mais de perto.
              </p>
              <p className="lp-plan__price">Valor em breve</p>
              <ul className="lp-plan__list">
                {PREMIUM.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" size={18} />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="lp-plan__note">O que está planejado. Avisamos quando estiver pronto.</p>
            </article>
          </div>
        </section>

        <section id="para-quem" className="lp-section">
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
      </main>

      <footer className="lp-footer">
        <MadeByNexo fundo="escuro" />
      </footer>
    </div>
  );
}
