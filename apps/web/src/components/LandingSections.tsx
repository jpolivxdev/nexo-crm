import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  Clock3,
  Hand,
  MessageCircle,
  PlayCircle,
  Sparkles,
  Star,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BASIC_PLAN, CUSTOM_PLAN, NEXO_CONTACT_URL, PREMIUM_PLAN } from '../lib/plans';

/** Liga `.is-visivel` quando o bloco entra na tela (uma vez), para as animações de entrada. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // sem IntersectionObserver (navegador antigo, testes), já começa visível
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

// ---------------- conversa de exemplo ----------------

type Bubble = { from: 'cliente' | 'robo'; text: ReactNode };

/** Mesmo fluxo do robô (boas-vindas, serviço, horário, confirmação), com dados fictícios. */
const CHAT: Bubble[] = [
  { from: 'cliente', text: 'Oi! Queria marcar um horário' },
  {
    from: 'robo',
    text: (
      <>
        Oi! Aqui é o atendimento do Estúdio Exemplo. Qual serviço?
        <span className="lp-chat__chips">
          <span>Corte</span>
          <span>Escova</span>
          <span>Unhas</span>
        </span>
      </>
    ),
  },
  { from: 'cliente', text: 'Corte' },
  {
    from: 'robo',
    text: (
      <>
        Tenho estes horários livres amanhã:
        <span className="lp-chat__chips">
          <span>9h</span>
          <span>14h30</span>
          <span>17h</span>
        </span>
      </>
    ),
  },
  { from: 'cliente', text: '14h30' },
  { from: 'robo', text: 'Pronto! Corte amanhã às 14h30. Te mando um lembrete antes.' },
];

export function ChatPreview() {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <section id="no-whatsapp" className="lp-section lp-chat-section">
      <div className="lp-chat-section__text">
        <p className="lp-eyebrow">
          <MessageCircle aria-hidden="true" size={16} />
          No WhatsApp
        </p>
        <h2>O cliente marca sozinho, em poucas mensagens</h2>
        <p className="lp-section__lead">
          O robô conversa com botões simples, só oferece horário livre e coloca tudo na sua agenda.
          Se o cliente pedir, ele passa a conversa para você.
        </p>
        <a href="#/demo" className="lp-button lp-button--gradient">
          <PlayCircle aria-hidden="true" size={18} />
          Testar na demonstração
        </a>
      </div>
      <div
        ref={ref}
        className={`lp-phone${visible ? ' is-visivel' : ''}`}
        role="img"
        aria-label="Exemplo de conversa: a cliente pede um horário, escolhe o serviço e o horário, e o robô confirma."
      >
        <div className="lp-phone__top" aria-hidden="true">
          <span className="lp-phone__avatar">E</span>
          <span>
            <strong>Estúdio Exemplo</strong>
            <small>exemplo fictício</small>
          </span>
        </div>
        <ol className="lp-chat" aria-hidden="true">
          {CHAT.map((b, i) => (
            <li
              key={i}
              className={`lp-chat__msg lp-chat__msg--${b.from}`}
              style={{ animationDelay: `${0.15 + i * 0.45}s` }}
            >
              {b.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------- destaques ----------------

const HIGHLIGHTS = [
  {
    Icon: Clock3,
    title: 'Atende 24 horas',
    text: 'Responde na hora, até de madrugada e no domingo.',
    wide: true,
  },
  {
    Icon: CalendarClock,
    title: 'Só horário livre',
    text: 'Respeita folgas, bloqueios e a duração de cada serviço.',
  },
  {
    Icon: BellRing,
    title: 'Lembrete antes',
    text: 'O cliente confirma ou cancela pelo próprio lembrete.',
  },
  {
    Icon: Hand,
    title: 'Um toque para assumir',
    text: 'O robô pausa quando você entra na conversa e volta quando você quiser.',
    wide: true,
  },
];

export function Highlights() {
  return (
    <section className="lp-section lp-reveal" aria-labelledby="lp-destaques">
      <h2 id="lp-destaques">Feito para quem atende e não tem tempo</h2>
      <ul className="lp-bento">
        {HIGHLIGHTS.map(({ Icon, title, text, wide }) => (
          <li key={title} className={`lp-bento__item${wide ? ' lp-bento__item--wide' : ''}`}>
            <span className="lp-bento__icon">
              <Icon aria-hidden="true" size={22} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------- planos ----------------

export function PlansSection({ signup }: { signup: boolean }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <section id="planos" className="lp-section lp-pricing">
      <h2>Planos</h2>
      <p className="lp-section__lead">
        Comece pelo Básico. O Premium está em teste, e o Personalizado a gente monta com você.
      </p>
      <div ref={ref} className={`lp-pricing__grid${visible ? ' is-visivel' : ''}`}>
        <article className="lp-price lp-price--lado lp-price--esq" aria-labelledby="plano-basico">
          <h3 className="lp-price__name" id="plano-basico">
            {BASIC_PLAN.name}
          </h3>
          <p className="lp-price__value">Valor em breve</p>
          <p className="lp-price__lead">{BASIC_PLAN.lead}</p>
          <PlanList items={BASIC_PLAN.items} />
          <hr />
          <div className="lp-price__cta">
            <a href="#/demo" className="lp-button lp-button--secondary">
              <PlayCircle aria-hidden="true" size={18} />
              Ver a demonstração
            </a>
            {signup && (
              <a href="#/criar-conta" className="lp-button lp-button--ghost">
                Criar conta
              </a>
            )}
          </div>
          <p className="lp-price__note">Disponível</p>
        </article>

        <article className="lp-price lp-price--destaque" aria-labelledby="plano-premium">
          <p className="lp-price__badge">
            <Star aria-hidden="true" size={14} />
            Mais completo
          </p>
          <h3 className="lp-price__name" id="plano-premium">
            {PREMIUM_PLAN.name}
          </h3>
          <p className="lp-price__value">Valor em breve</p>
          <p className="lp-price__lead">{PREMIUM_PLAN.lead}</p>
          <PlanList items={PREMIUM_PLAN.items} />
          <hr />
          <div className="lp-price__cta">
            <a href="#/demo-premium" className="lp-button lp-button--gradient">
              <PlayCircle aria-hidden="true" size={18} />
              Demonstração do Premium
            </a>
          </div>
          <p className="lp-price__note">Em teste com o primeiro negócio.</p>
        </article>

        <article
          className="lp-price lp-price--lado lp-price--dir"
          aria-labelledby="plano-personalizado"
        >
          <h3 className="lp-price__name" id="plano-personalizado">
            {CUSTOM_PLAN.name}
          </h3>
          <p className="lp-price__value">Sob medida</p>
          <p className="lp-price__lead">{CUSTOM_PLAN.lead}</p>
          <PlanList items={CUSTOM_PLAN.items} />
          <hr />
          <div className="lp-price__cta">
            <ContactButton />
          </div>
          <p className="lp-price__note">
            {NEXO_CONTACT_URL ? 'A gente responde e combina com você.' : 'Contato em breve.'}
          </p>
        </article>
      </div>
    </section>
  );
}

function PlanList({ items }: { items: string[] }) {
  return (
    <ul className="lp-price__list">
      {items.map((item) => (
        <li key={item}>
          <Check aria-hidden="true" size={16} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ContactButton({ large = false }: { large?: boolean }) {
  const cls = `lp-button lp-button--light${large ? ' lp-button--lg' : ''}`;
  if (!NEXO_CONTACT_URL) {
    return (
      <span className={`${cls} lp-button--off`} aria-disabled="true">
        <MessageCircle aria-hidden="true" size={18} />
        Fale conosco
      </span>
    );
  }
  const external = /^https?:/.test(NEXO_CONTACT_URL);
  return (
    <a
      href={NEXO_CONTACT_URL}
      className={cls}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <MessageCircle aria-hidden="true" size={18} />
      Fale conosco
    </a>
  );
}

// ---------------- perguntas ----------------

const FAQ = [
  {
    q: 'Preciso instalar alguma coisa?',
    a: 'Não. O painel abre no navegador do celular ou do computador, e o cliente continua usando o WhatsApp de sempre.',
  },
  {
    q: 'O robô responde qualquer pergunta?',
    a: 'Ele cuida do que se repete: marcar, remarcar, cancelar e ver o horário. O que ele não entende vira um aviso para você, com um toque para assumir a conversa.',
  },
  {
    q: 'Posso testar antes?',
    a: 'Pode. A demonstração abre o painel com um negócio e clientes fictícios, sem cadastro, e nada do que você fizer é salvo.',
  },
  {
    q: 'Quanto custa?',
    a: 'Os valores ainda estão sendo definidos, porque o sistema está em fase de testes com o primeiro negócio. Eles aparecem aqui assim que estiverem fechados.',
  },
];

export function Faq() {
  return (
    <section id="perguntas" className="lp-section lp-reveal">
      <h2>Perguntas frequentes</h2>
      <div className="lp-faq">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="lp-faq__item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------------- chamada final ----------------

export function FinalCta() {
  return (
    <section className="lp-section lp-reveal">
      <div className="lp-final">
        <Sparkles aria-hidden="true" size={28} className="lp-final__icon" />
        <h2>Veja como fica o seu dia com a nexo</h2>
        <p>Abra a demonstração e mexa à vontade. Leva um minuto.</p>
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
      </div>
    </section>
  );
}
