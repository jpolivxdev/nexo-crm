import { Compass, X } from 'lucide-react';

/**
 * Faixa fixa da demonstração: deixa claro que os dados são fictícios e que nada é salvo
 * (princípio 7: demo identificado como demo).
 */
export function DemoBanner({
  onTour,
  onLeave,
}: {
  onTour: () => void;
  /** Sai da demo e vai para a tela indicada (página inicial ou criar conta). */
  onLeave: (to: string) => void;
}) {
  return (
    <div className="demo-banner" role="status">
      <p>
        <strong>Demonstração</strong> com dados fictícios.{' '}
        <span className="demo-banner__more">
          Pode mexer à vontade: nada é salvo e nenhuma mensagem sai.
        </span>
      </p>
      <div className="demo-banner__actions">
        <button type="button" className="button button--small button--ghost" onClick={onTour}>
          <Compass aria-hidden="true" size={16} /> Ver o tour
        </button>
        <button
          type="button"
          className="button button--small"
          onClick={() => onLeave('/criar-conta')}
        >
          Criar conta
        </button>
        <button
          type="button"
          className="icon-button demo-banner__close"
          aria-label="Sair da demonstração"
          onClick={() => onLeave('/')}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}
