import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Topo de cada tela, num cartão: ícone, título, uma linha explicando a tela e as ações à
 * direita (embaixo no celular). Inspirado no CRM de referência que o JP trouxe em 06/11/2026.
 */
export function PageHeader({
  Icon,
  title,
  subtitle,
  actions,
  children,
}: {
  Icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__main">
        {Icon && (
          <span className="page-header__icon" aria-hidden="true">
            <Icon size={22} />
          </span>
        )}
        <div className="page-header__text">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
