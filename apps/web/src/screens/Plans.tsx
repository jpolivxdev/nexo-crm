import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '../components/ui';

/**
 * Planos e assinatura: só a tela, sem cobrança (pedido do JP em 27/10/2026).
 * Inspirada no bloco "Pricing" do 21st.dev, refeita em CSS do projeto.
 * Nomes, preços e o que entra em cada plano são [A DEFINIR com o Coca]: nada aqui é oferta.
 */

interface PlanCard {
  id: string;
  name: string;
  summary: string;
  features: { text: string; soon?: boolean }[];
  highlight?: boolean;
  current?: boolean;
}

const PLANS: PlanCard[] = [
  {
    id: 'basico',
    name: 'Básico',
    summary: 'Para começar a receber horários pelo WhatsApp.',
    current: true,
    features: [
      { text: 'Robô que marca, remarca e cancela horários' },
      { text: 'Agenda e ficha de cada cliente' },
      { text: 'Lembretes 24 h e 1 h antes' },
      { text: 'Resultados do mês' },
    ],
  },
  {
    id: 'ia',
    name: 'Com IA',
    summary: 'Para quem recebe muita mensagem escrita do jeito da cliente.',
    highlight: true,
    features: [
      { text: 'Tudo do Básico' },
      { text: 'Entende mensagem escrita livre e áudio', soon: true },
      { text: 'Resumo de cada conversa', soon: true },
      { text: 'Sugestão de quem chamar de volta', soon: true },
    ],
  },
  {
    id: 'equipe',
    name: 'Equipe',
    summary: 'Para estúdios com mais de uma profissional.',
    features: [
      { text: 'Tudo do Com IA' },
      { text: 'Login e agenda para cada profissional', soon: true },
      { text: 'Permissões por pessoa', soon: true },
      { text: 'Resultados por profissional' },
    ],
  },
];

export function Plans({ go }: { go: (to: string) => void }) {
  const [yearly, setYearly] = useState(false);

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
              {plan.current ? 'Seu plano atual' : 'Em breve'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
