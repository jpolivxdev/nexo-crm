import '../styles/tooltip.css';
import { useEffect, useRef } from 'react';
import { installFluidTooltip } from '../lib/fluidTooltip';

/**
 * Balão de dica único do painel (ver `lib/fluidTooltip.ts`). Montado uma vez, na raiz:
 * os botões não precisam de nada além do `aria-label` ou de `data-tip`.
 */
export function FluidTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return installFluidTooltip(ref.current);
  }, []);
  return <div ref={ref} id="nexo-dica" className="ftip" role="tooltip" />;
}
