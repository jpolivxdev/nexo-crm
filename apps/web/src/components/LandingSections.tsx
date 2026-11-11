import {
  ArrowRight,
  BellRing,
  Brush,
  CalendarClock,
  ChartColumn,
  Check,
  Eye,
  Hand,
  MessageCircle,
  PawPrint,
  PlayCircle,
  Scissors,
  Sparkles,
  SquareKanban,
  Star,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NICHES } from '../lib/niches';
import { Phone } from './Phone';
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

// ---------------- telas de exemplo dentro do celular ----------------

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

export const CHAT_LABEL =
  'Exemplo fictício de conversa no WhatsApp: a cliente pede um horário, escolhe o serviço e o horário, e o robô confirma.';

/** Conversa no WhatsApp (as mensagens entram uma a uma quando `play` liga). */
export function ChatScreen({ play }: { play: boolean }) {
  return (
    <div className={`lp-wa${play ? ' is-visivel' : ''}`}>
      <div className="lp-wa__top">
        <span className="lp-wa__avatar">E</span>
        <span>
          <strong>Estúdio Exemplo</strong>
          <small>exemplo fictício</small>
        </span>
      </div>
      <ol className="lp-chat">
        {CHAT.map((b, i) => (
          <li
            key={i}
            className={`lp-chat__msg lp-chat__msg--${b.from}`}
            style={{ animationDelay: `${0.2 + i * 0.45}s` }}
          >
            {b.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const DAY = [
  { hora: '9h', nome: 'Ana (demo)', servico: 'Corte', tag: 'Pelo robô' },
  { hora: '10h30', nome: 'Bia (demo)', servico: 'Escova', tag: 'Confirmou' },
  { hora: '14h30', nome: 'Carla (demo)', servico: 'Corte', tag: 'Pelo robô' },
  { hora: '16h', nome: 'Duda (demo)', servico: 'Unhas', tag: 'Confirmou' },
];

export const AGENDA_LABEL =
  'Exemplo fictício do painel no celular: o dia de hoje com quatro horários marcados.';

/** O dia de hoje no painel, versão celular. */
export function AgendaScreen() {
  return (
    <div className="lp-dia">
      <p className="lp-dia__eyebrow">Seu painel · exemplo</p>
      <p className="lp-dia__title">Seu dia de hoje</p>
      <div className="lp-dia__kpis">
        <span>
          <strong>4</strong>horários
        </span>
        <span className="is-roxo">
          <strong>2</strong>pelo robô
        </span>
      </div>
      <ul className="lp-dia__list">
        {DAY.map((d) => (
          <li key={d.hora}>
            <span className="lp-dia__hora">{d.hora}</span>
            <span className="lp-dia__quem">
              <strong>{d.nome}</strong>
              {d.servico}
            </span>
            <span className="lp-dia__tag">{d.tag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- como funciona: passo a passo em faixas alternadas ----------------

/** Um passo: texto grande de um lado, a tela de exemplo grande do outro. Entra ao rolar. */
function Step({
  n,
  title,
  text,
  children,
}: {
  n: number;
  title: string;
  text: string;
  children: ReactNode;
}) {
  const [ref, visible] = useInView<HTMLLIElement>();
  return (
    <li ref={ref} className={`lp-passo${visible ? ' is-visivel' : ''}`}>
      <div className="lp-passo__texto">
        <span className="lp-passo__n">{String(n).padStart(2, '0')}</span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <div className="lp-passo__tela">{children}</div>
    </li>
  );
}

export function Steps({ preview }: { preview: string }) {
  return (
    <section id="como-funciona" className="lp-band lp-passos-section">
      <div className="lp-band__head">
        <p className="lp-eyebrow">
          <Sparkles aria-hidden="true" size={16} />
          Como funciona
        </p>
        <h2>Tudo o que acontece no WhatsApp vira agenda, ficha e lembrete.</h2>
      </div>
      <ol className="lp-passos">
        <Step
          n={1}
          title="O cliente marca pelo WhatsApp"
          text="O robô responde na hora, até de madrugada, e só oferece os horários livres."
        >
          <div className="lp-tela lp-tela--chat" aria-hidden="true">
            <span className="lp-tela__in">Oi! Tem horário amanhã para corte?</span>
            <span className="lp-tela__out">
              Tenho estes horários livres amanhã:
              <span className="lp-chat__chips">
                <span>9h</span>
                <span>14h30</span>
                <span>17h</span>
              </span>
            </span>
            <span className="lp-tela__in">14h30</span>
            <span className="lp-tela__out">Pronto! Corte amanhã às 14h30.</span>
          </div>
        </Step>
        <Step
          n={2}
          title="O horário cai na sua agenda"
          text={
            'Você vê o dia no celular ou no computador e marca "realizado" ou "faltou" com um toque.'
          }
        >
          <figure className="lp-preview lp-tela lp-tela--painel">
            <img
              src={preview}
              alt="Tela do painel com a agenda do dia de um negócio de exemplo"
              width={1280}
              height={800}
              loading="lazy"
            />
            <figcaption>Painel com dados de exemplo (fictícios).</figcaption>
          </figure>
        </Step>
        <Step
          n={3}
          title="Lembrete antes do horário"
          text="Um dia antes e uma hora antes. O cliente confirma ou cancela ali mesmo, e a agenda se ajusta."
        >
          <div className="lp-tela lp-tela--lembrete" aria-hidden="true">
            <span className="lp-tela__rotulo">
              <BellRing size={16} /> Lembrete · amanhã
            </span>
            <span className="lp-tela__out">
              Oi! Passando para lembrar do seu horário: corte, amanhã às 14h30. Você confirma?
              <span className="lp-tela__btns">
                <b>Confirmar</b>
                <b>Cancelar</b>
              </span>
            </span>
            <span className="lp-tela__in">Confirmar</span>
          </div>
        </Step>
        <Step
          n={4}
          title="A ficha do cliente se monta sozinha"
          text="Conversas, horários e faltas de cada cliente num lugar só, sem você digitar nada."
        >
          <div className="lp-tela lp-tela--ficha" aria-hidden="true">
            <div className="lp-tela__pessoa">
              <span className="lp-mini-ficha__avatar">C</span>
              <span>
                <strong>Carla (demo)</strong>
                <small>Cliente desde março · exemplo</small>
              </span>
            </div>
            <ul>
              <li>
                <CalendarClock size={18} />
                <span>
                  <strong>8</strong> horários
                </span>
              </li>
              <li>
                <MessageCircle size={18} />
                <span>
                  <strong>14</strong> conversas
                </span>
              </li>
              <li>
                <Check size={18} />
                <span>
                  <strong>0</strong> faltas
                </span>
              </li>
            </ul>
            <p className="lp-tela__nota">Último horário: corte, 28/10 · Realizado</p>
          </div>
        </Step>
        <Step
          n={5}
          title="Você no controle"
          text="Quando o cliente pede para falar com você, o robô pausa e te avisa. Um toque e ele volta."
        >
          <div className="lp-tela lp-tela--controle" aria-hidden="true">
            <span className="lp-tela__aviso">
              <Hand size={18} /> Bia (demo) pediu para falar com você
            </span>
            <div className="lp-mini-switch">
              <span className="lp-mini-switch__track">
                <span />
              </span>
              <span>
                <strong>Você na conversa</strong>
                <small>robô pausado</small>
              </span>
            </div>
          </div>
        </Step>
      </ol>
    </section>
  );
}

// ---------------- celular no centro, funções chegando dos lados ----------------

const ORBIT = [
  { Icon: CalendarClock, label: 'Agenda', side: 'esq' },
  { Icon: BellRing, label: 'Lembretes', side: 'esq' },
  { Icon: Users, label: 'Clientes', side: 'esq' },
  { Icon: SquareKanban, label: 'Etapas', side: 'dir' },
  { Icon: Hand, label: 'Passar para você', side: 'dir' },
  { Icon: ChartColumn, label: 'Resultados', side: 'dir' },
] as const;

export function Orbit() {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <section id="no-whatsapp" className="lp-band lp-orbit-section">
      <div className="lp-band__head lp-band__head--centro">
        <p className="lp-eyebrow">
          <MessageCircle aria-hidden="true" size={16} />
          No WhatsApp
        </p>
        <h2>Seu cliente conversa. O resto se organiza sozinho.</h2>
        <p className="lp-band__lead">
          O robô conversa com botões simples, só oferece horário livre e coloca tudo na sua agenda.
          Se o cliente pedir, ele passa a conversa para você.
        </p>
      </div>
      <div ref={ref} className={`lp-orbit${visible ? ' is-visivel' : ''}`}>
        <ul className="lp-orbit__lado lp-orbit__lado--esq" aria-label="O que a conversa alimenta">
          {ORBIT.filter((o) => o.side === 'esq').map(({ Icon, label }, i) => (
            <li key={label} style={{ transitionDelay: `${0.15 + i * 0.15}s` }}>
              <Icon aria-hidden="true" size={22} />
              {label}
            </li>
          ))}
        </ul>
        <Phone className="phone--orbit" label={CHAT_LABEL}>
          <ChatScreen play={visible} />
        </Phone>
        <ul
          className="lp-orbit__lado lp-orbit__lado--dir"
          aria-label="Mais do que a conversa alimenta"
        >
          {ORBIT.filter((o) => o.side === 'dir').map(({ Icon, label }, i) => (
            <li key={label} style={{ transitionDelay: `${0.15 + i * 0.15}s` }}>
              <Icon aria-hidden="true" size={22} />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="lp-orbit__cta">
        <a href="#/demo" className="lp-button lp-button--gradient lp-button--lg">
          <PlayCircle aria-hidden="true" size={18} />
          Testar na demonstração
        </a>
      </p>
    </section>
  );
}

// ---------------- título fixo, fatos do produto rolando ao lado ----------------

/** Só o que o sistema faz hoje (robô, lembretes e trava de horário estão no código). */
const FACTS = [
  {
    big: '24 h',
    title: 'atendendo',
    text: 'O robô responde de madrugada, no domingo e no feriado.',
  },
  {
    big: '2',
    title: 'lembretes por horário',
    text: 'Um dia antes e uma hora antes, com confirmar e cancelar no próprio WhatsApp.',
  },
  {
    big: '0',
    title: 'horário marcado duas vezes',
    text: 'Se dois clientes tentam o mesmo horário ao mesmo tempo, só um fica com ele.',
  },
  {
    big: '1',
    title: 'toque para assumir',
    text: 'Você entra na conversa e o robô pausa. Outro toque e ele volta.',
  },
];

export function Facts() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return;
    const items = [...list.children];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(items.indexOf(e.target));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section id="por-que" className="lp-band lp-facts">
      <div className="lp-facts__fixo">
        <p className="lp-eyebrow">Por que a nexo</p>
        <h2>Feito para quem atende sozinho e não tem tempo de responder.</h2>
        <p className="lp-band__lead">O robô cuida do que se repete. Você cuida do atendimento.</p>
      </div>
      <ol ref={listRef} className="lp-facts__lista">
        {FACTS.map((f, i) => (
          <li key={f.title} className={i === active ? 'is-ativo' : undefined}>
            <span className="lp-facts__big">{f.big}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------- planos ----------------

export function PlansSection({ signup }: { signup: boolean }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <section id="planos" className="lp-band lp-pricing">
      <div className="lp-band__head">
        <p className="lp-eyebrow">Planos</p>
        <h2>Escolha o plano que cabe no seu negócio.</h2>
        <p className="lp-band__lead">
          Comece pelo Básico. O Premium está em teste, e o Personalizado a gente monta com você.
        </p>
      </div>
      <div ref={ref} className={`lp-pricing__grid${visible ? ' is-visivel' : ''}`}>
        <article className="lp-price" aria-labelledby="plano-basico">
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

        <article className="lp-price lp-price--destaque lp-escuro" aria-labelledby="plano-premium">
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

        <article className="lp-price" aria-labelledby="plano-personalizado">
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
    <section id="perguntas" className="lp-band lp-reveal">
      <div className="lp-band__head">
        <p className="lp-eyebrow">Perguntas</p>
        <h2>Perguntas frequentes</h2>
        <p className="lp-band__lead">
          O que mais perguntam antes de testar. Se a sua não estiver aqui, a demonstração mostra o
          resto.
        </p>
        <a href="#/demo" className="lp-button lp-button--secondary">
          <PlayCircle aria-hidden="true" size={18} />
          Ver a demonstração
        </a>
      </div>
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

// ---------------- para quem é ----------------

const NICHE_ICON: Record<string, typeof Eye> = {
  cilios: Eye,
  salao: Brush,
  barbearia: Scissors,
  estudio: Sparkles,
  clinica: Stethoscope,
  pet: PawPrint,
};

export function ForWhom() {
  return (
    <section id="para-quem" className="lp-band lp-quem lp-reveal">
      <div className="lp-quem__caixa">
        <div className="lp-band__head">
          <p className="lp-eyebrow">Para quem é</p>
          <h2>Pequenos negócios que marcam horário e atendem pelo WhatsApp.</h2>
        </div>
        <ul className="lp-quem__lista">
          {NICHES.filter((n) => n.value !== 'outro').map((n) => {
            const Icon = NICHE_ICON[n.value] ?? Sparkles;
            return (
              <li key={n.value}>
                <span className="lp-quem__icone" aria-hidden="true">
                  <Icon size={22} />
                </span>
                {n.label}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------------- chamada final ----------------

export function FinalCta() {
  return (
    <section className="lp-band lp-reveal">
      <div className="lp-final lp-escuro">
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
