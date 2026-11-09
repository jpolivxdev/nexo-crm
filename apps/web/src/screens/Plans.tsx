import { Check, CreditCard, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useState } from 'react';
import { Banner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isDemo } from '../lib/demo/mode';
import { BASIC_PLAN, PREMIUM_PLAN, type PlanInfo } from '../lib/plans';

/**
 * Plano e assinatura: só a tela, sem cobrança (pedido do JP em 27/10/2026).
 * Mostra os mesmos dois planos da página inicial (Básico e Premium, decisão de 09/11/2026).
 * Preços são [A DEFINIR com o Coca]: nada aqui é oferta. O servidor ainda trava recursos pelos
 * códigos antigos (FREE, CRM, COMPLETE); o Básico corresponde ao COMPLETE, que libera tudo o que
 * já existe.
 */
export function Plans({ go }: { go: (to: string) => void }) {
  const [yearly, setYearly] = useState(false);
  const current = useAuth().me?.plan ?? null;
  const demo = isDemo();
  const basicLabel = demo
    ? 'Plano desta demonstração'
    : current === 'COMPLETE'
      ? 'Seu plano atual'
      : 'Em breve';

  const cards: { plan: PlanInfo; tag: string; button: string; main: boolean }[] = [
    { plan: BASIC_PLAN, tag: 'Disponível', button: basicLabel, main: true },
    { plan: PREMIUM_PLAN, tag: 'Em construção', button: 'Em construção', main: false },
  ];

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <PageHeader
        Icon={CreditCard}
        title="Plano e assinatura"
        subtitle="Escolha como a nexo trabalha para o seu negócio."
      />
      <Banner kind="ok">
        Prévia: os preços ainda estão sendo definidos. Nada é cobrado por enquanto.
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

      <ul className="plans plans--two">
        {cards.map(({ plan, tag, button, main }) => (
          <li
            key={plan.id}
            className={main ? 'plan plan--highlight' : 'plan'}
            aria-labelledby={`plano-${plan.id}`}
          >
            <span className={main ? 'plan__flag' : 'plan__flag plan__flag--soon'}>
              {main && <Sparkles aria-hidden="true" size={14} />} {tag}
            </span>
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
            <p className="plan__summary">{plan.lead}</p>
            <ul className="plan__features">
              {plan.items.map((item) => (
                <li key={item}>
                  <Check aria-hidden="true" size={18} className="plan__check" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {!main && (
              <p className="plan__note muted">
                O que está planejado. Avisamos quando estiver pronto.
              </p>
            )}
            <button type="button" className={main ? 'button' : 'button button--ghost'} disabled>
              {button}
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
