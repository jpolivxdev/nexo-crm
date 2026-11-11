import { BatteryFull, Signal, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Celular desenhado em CSS (moldura, ilha, barra de status e botões laterais) para mostrar telas
 * de exemplo na página de entrada. Desenho próprio, sem imagem de aparelho de terceiros.
 */
export function Phone({
  children,
  label,
  className = '',
}: {
  children: ReactNode;
  /** Texto para o leitor de tela: o que a tela mostra. */
  label: string;
  className?: string;
}) {
  return (
    <div className={`phone ${className}`} role="img" aria-label={label}>
      <span className="phone__btn phone__btn--acao" aria-hidden="true" />
      <span className="phone__btn phone__btn--vol1" aria-hidden="true" />
      <span className="phone__btn phone__btn--vol2" aria-hidden="true" />
      <span className="phone__btn phone__btn--power" aria-hidden="true" />
      <div className="phone__screen" aria-hidden="true">
        <div className="phone__status">
          <span className="phone__time">9:41</span>
          <span className="phone__island" />
          <span className="phone__icons">
            <Signal size={13} strokeWidth={2.5} />
            <Wifi size={13} strokeWidth={2.5} />
            <BatteryFull size={17} strokeWidth={2} />
          </span>
        </div>
        <div className="phone__body">{children}</div>
        <span className="phone__home" />
      </div>
    </div>
  );
}
