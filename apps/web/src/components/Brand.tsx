import { useTheme } from '../lib/theme';

/**
 * Logo oficial da nexo (guia de marca). Mesmo desenho dos SVGs em `assets/brand`, sem alteração.
 * Fica inline (e não como <img>) para o "nexo" usar a fonte Sora carregada pela página.
 * Abaixo de 24 px, só o símbolo.
 */

const PALETTE = {
  claro: { stroke: '#100C24', dot: '#6A1FE8', text: '#100C24' },
  escuro: { stroke: '#FFFFFF', dot: '#A98BFF', text: '#FFFFFF' },
} as const;

type Fundo = keyof typeof PALETTE;

export function NexoLogo({ fundo = 'claro', height = 32 }: { fundo?: Fundo; height?: number }) {
  const c = PALETTE[fundo];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 248 64"
      height={height}
      width={(height * 248) / 64}
      role="img"
      aria-label="nexo"
    >
      <g>
        <path
          d="M18 52 V30 a14 14 0 0 1 28 0 V32"
          fill="none"
          stroke={c.stroke}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle cx="46" cy="48" r="6.5" fill={c.dot} />
      </g>
      <text
        x="76"
        y="51"
        fontFamily="Sora, sans-serif"
        fontWeight="700"
        fontSize="64"
        letterSpacing="-2.9"
        fill={c.text}
      >
        nexo
      </text>
    </svg>
  );
}

export function NexoSymbol({ fundo = 'claro', size = 24 }: { fundo?: Fundo; size?: number }) {
  const c = PALETTE[fundo];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path
        d="M18 52 V30 a14 14 0 0 1 28 0 V32"
        fill="none"
        stroke={c.stroke}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="46" cy="48" r="6.5" fill={c.dot} />
    </svg>
  );
}

/** "feito pela nexo", discreto, no rodapé do painel. */
export function MadeByNexo() {
  // No tema escuro, a versão oficial para fundo escuro.
  const theme = useTheme();
  return (
    <footer className="made-by">
      <NexoSymbol size={24} fundo={theme} />
      <span>feito pela nexo</span>
    </footer>
  );
}
