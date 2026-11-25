import { useSyncExternalStore } from 'react';

/**
 * Visual de vidro do painel: fundo com as cores da marca, barra de cima, menu e área principal
 * em vidro, cartões translúcidos por dentro. Fica só neste aparelho (preferência visual, como o tema).
 *
 * Ideia: "adjustable glass dashboard" do 21st.dev (desfoque, opacidade, saturação e brilho da
 * borda ajustáveis). Nada do código de lá foi copiado: aqui é CSS próprio (`styles/glass.css`)
 * ligado por variáveis no <html>, sem Tailwind, shadcn nem GSAP.
 */
export interface GlassSettings {
  /** Ligado ou não. Desligado, o painel volta às superfícies sólidas de sempre. */
  on: boolean;
  /** Desfoque do que fica atrás, em px. */
  blur: number;
  /**
   * Quanto a moldura de vidro cobre o fundo (0,25 a 0,9). Os cartões de dentro somam mais
   * cobertura por cima; abaixo de 0,25 o texto cinza perderia contraste.
   */
  opacity: number;
  /** Cor do fundo atrás do vidro (1 = normal, 2 = bem viva). */
  saturation: number;
  /** Brilho da borda (0 a 1). */
  edge: number;
}

export type GlassPreset = 'transparente' | 'fosco' | 'solido';

export const GLASS_LIMITS = {
  blur: { min: 0, max: 32, step: 1 },
  opacity: { min: 0.25, max: 0.9, step: 0.01 },
  saturation: { min: 1, max: 2, step: 0.05 },
  edge: { min: 0, max: 1, step: 0.05 },
} as const;

export const GLASS_PRESETS: Record<GlassPreset, Omit<GlassSettings, 'on'>> = {
  transparente: { blur: 12, opacity: 0.25, saturation: 1.4, edge: 0.8 },
  fosco: { blur: 22, opacity: 0.4, saturation: 1.2, edge: 0.6 },
  solido: { blur: 32, opacity: 0.85, saturation: 1, edge: 0.35 },
};

export const GLASS_DEFAULT: GlassSettings = { on: true, ...GLASS_PRESETS.fosco };

// v2: o visual mudou (moldura de vidro em todo o painel); a escolha antiga não vale mais.
const KEY = 'nexo-vidro-v2';
const listeners = new Set<() => void>();
let cache: GlassSettings | null = null;

function clamp(value: unknown, key: keyof typeof GLASS_LIMITS): number {
  const { min, max } = GLASS_LIMITS[key];
  const n = typeof value === 'number' && Number.isFinite(value) ? value : GLASS_DEFAULT[key];
  return Math.min(max, Math.max(min, n));
}

/** Corrige valores fora da faixa (ou vindos de uma versão antiga). */
export function normalizeGlass(v: Partial<GlassSettings> | null | undefined): GlassSettings {
  const src = v ?? {};
  return {
    on: typeof src.on === 'boolean' ? src.on : GLASS_DEFAULT.on,
    blur: clamp(src.blur, 'blur'),
    opacity: clamp(src.opacity, 'opacity'),
    saturation: clamp(src.saturation, 'saturation'),
    edge: clamp(src.edge, 'edge'),
  };
}

export function readGlass(): GlassSettings {
  if (cache) return cache;
  let saved: Partial<GlassSettings> | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw) as Partial<GlassSettings>;
  } catch {
    // navegação privada, armazenamento bloqueado ou valor estragado: fica no padrão
  }
  cache = normalizeGlass(saved);
  return cache;
}

/** Qual modelo pronto bate com os valores atuais (ou null, se a pessoa ajustou à mão). */
export function matchPreset(s: GlassSettings): GlassPreset | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  for (const [id, p] of Object.entries(GLASS_PRESETS) as [GlassPreset, GlassSettings][]) {
    if (
      near(s.blur, p.blur) &&
      near(s.opacity, p.opacity) &&
      near(s.saturation, p.saturation) &&
      near(s.edge, p.edge)
    )
      return id;
  }
  return null;
}

/** Põe os valores no <html>: `data-vidro` liga o CSS e as variáveis `--vidro-*` ajustam. */
export function applyGlass(s: GlassSettings = readGlass()): void {
  const root = document.documentElement;
  if (s.on) root.dataset.vidro = 'on';
  else delete root.dataset.vidro;
  root.style.setProperty('--vidro-desfoque', `${s.blur}px`);
  root.style.setProperty('--vidro-opacidade', String(s.opacity));
  root.style.setProperty('--vidro-saturacao', String(s.saturation));
  root.style.setProperty('--vidro-borda', String(s.edge));
  listeners.forEach((fn) => fn());
}

export function setGlass(patch: Partial<GlassSettings>): void {
  const next = normalizeGlass({ ...readGlass(), ...patch });
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // sem armazenamento: vale só até fechar a página
  }
  applyGlass(next);
}

export function resetGlass(): void {
  setGlass(GLASS_DEFAULT);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useGlass(): GlassSettings {
  return useSyncExternalStore(subscribe, readGlass, () => GLASS_DEFAULT);
}

/** Só para testes: esquece o que foi lido do armazenamento. */
export function _forgetGlass(): void {
  cache = null;
}
