import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '../components/ui';
import { useAuth } from '../lib/auth';

/**
 * Planos e assinatura: só a tela, sem cobrança (pedido do JP em 27/10/2026).
 * Inspirada no bloco "Pricing" do 21st.dev, refeita em CSS do projeto.
 * Nomes, preços e o que entra em cada plano são [A DEFINIR com o Coca]: nada aqui é oferta.
 */

interface PlanCard {
  id: 'FREE' | 'CRM' | 'COMPLETE';
  name: string;
  summary: string;
  features: { text: string; soon?: boolean }[];
  highlight?: boolean;
}

/*
 * Divisão pedida pelo Jandoza em 27/10/2026: Grátis (CRM básico), CRM e Completo
 * (CRM + agenda + robô do WhatsApp). Limites e preços: [A DEFINIR com o Coca].
 * O servidor trava agenda, robô, lembretes e resultados pelo plano do negócio (@nexo/core).
 */
const PLANS: PlanCard[] = [
  {
    id: 'FREE',
    name: 'Grátis',
    summary: 'Para organizar suas clientes num lugar só.',
    features: [
      { text: 'Ficha de cada cliente com o histórico' },
      { text: 'Etapas de cada cliente' },
      { text: 'Limite de clientes a definir' },
    ],
  },
  {
    id: 'CRM',
    name: 'CRM',
    summary: 'Para acompanhar cada cliente do primeiro contato ao retorno.',
    features: [
      { text: 'Tudo do Grátis, sem limite de clientes' },
      { text: 'Resultados do mês' },
      { text: 'Lista do que fazer em cada dia' },
      { text: 'Retornos automáticos para quem sumiu', soon: true },
      { text: 'Etiquetas e etapas do seu jeito', soon: true },
    ],
  },
  {
    id: 'COMPLETE',
    name: 'Completo',
    summary: 'CRM, agenda e robô no WhatsApp trabalhando juntos.',
    highlight: true,
    features: [
      { text: 'Tudo do CRM' },
      { text: 'Agenda com serviços, horários e pausas' },
      { text: 'Robô que marca, remarca e cancela horários' },
      { text: 'Lembretes 24 h e 1 h antes' },
      { text: 'Conectar o número de WhatsApp do negócio', soon: true },
    ],
  },
];

export function Plans({ go }: { go: (to: string) => void }) {
  const [yearly, setYearly] = useState(false);
  const current = useAuth().me?.plan ?? null;

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <header className="page-header">
        <h1>Plano e assinatura</h1>
        <p className="muted">Escolha como a nexo trabalha para o seu negócio.</p>
      </header>
      <Banner kind="ok">
        Prévia: os planos e preços ainda estão sendo definidos. Nada é cobrado por enquanto.
      </Banner>

      <div className="segmented plans__period" role="group" aria-label="Forma de pagamento">
        <button
          type="button"
          aria-pressed={!yearly}
          className={!yearly ? 'on' : ''}
          onClick={() => setYearly(false)}
        >
          Mensal
        </button>
        <button
          type="button"
          aria-pressed={yearly}
          className={yearly ? 'on' : ''}
          onClick={() => setYearly(true)}
        >
          Anual
        </button>
      </div>

      <ul className="plans">
        {PLANS.map((plan) => (
          <li
            key={plan.id}
            className={plan.highlight ? 'plan plan--highlight' : 'plan'}
            aria-labelledby={`plano-${plan.id}`}
          >
            {plan.highlight && (
              <span className="plan__flag">
                <Sparkles aria-hidden="true" size={14} /> Mais completo
              </span>
            )}
            <h2 id={`plano-${plan.id}`} className="plan__name">
              {plan.name}
            </h2>
            <p className="plan__price">
              <span className="plan__value">R$ —</span>
              <span className="muted">/ {yearly ? 'ano' : 'mês'}</span>
            </p>
            <p className="plan__note muted">
              Preço a definir{yearly ? ' · desconto no anual a definir' : ''}
            </p>
            <p className="plan__summary">{plan.summary}</p>
            <ul className="plan__features">
              {plan.features.map((f) => (
                <li key={f.text}>
                  <Check aria-hidden="true" size={18} className="plan__check" />
                  <span>
                    {f.text}
                    {f.soon && <span className="plan__soon">em breve</span>}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={plan.highlight ? 'button' : 'button button--ghost'}
              disabled
            >
              {plan.id === current ? 'Seu plano atual' : 'Em breve'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Tela de uma seção que o plano do negócio não inclui. */
export function NotInPlan({ go, name }: { go: (to: string) => void; name: string }) {
  return (
    <section className="card" aria-labelledby="fora-do-plano">
      <h1 id="fora-do-plano">{name} não faz parte do seu plano</h1>
      <p className="muted">
        Para usar, fale com a nexo e troque de plano. Suas clientes e o histórico continuam aqui.
      </p>
      <button type="button" className="button button--small" onClick={() => go('/assinatura')}>
        Ver planos
      </button>
    </section>
  );
}
