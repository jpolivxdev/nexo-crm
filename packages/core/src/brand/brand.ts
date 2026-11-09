/**
 * Marca do negócio (Premium): cor dos botões, fonte e domínio próprio.
 * A cor precisa de contraste 4,5:1 com o texto branco do botão (CLAUDE.md, seção 11).
 */
export const BRAND_FONTS = ['nexo', 'sistema', 'classica'] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

/** Sugestões que já passam no contraste. */
export const BRAND_COLOR_SUGGESTIONS = [
  '#6A1FE8',
  '#2F5BFF',
  '#0F766E',
  '#B4235A',
  '#9A3412',
  '#100C24',
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Contraste entre duas cores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function checkBrandColor(
  value: string,
): { ok: true; color: string } | { ok: false; error: string } {
  const color = value.trim().toUpperCase();
  if (!HEX.test(color)) return { ok: false, error: 'Use uma cor no formato #RRGGBB.' };
  if (contrastRatio(color, '#FFFFFF') < 4.5) {
    return {
      ok: false,
      error: 'Essa cor é clara demais para botão com texto branco. Escolha um tom mais escuro.',
    };
  }
  return { ok: true, color };
}

/**
 * Domínio próprio: só o endereço (sem http, caminho ou porta), em minúsculas.
 * Precisa de pelo menos um ponto e não pode ser da própria nexo.
 */
export function normalizeDomain(
  value: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const parts = domain.split('.');
  if (domain.length > 253 || parts.length < 2 || !parts.every((p) => label.test(p))) {
    return { ok: false, error: 'Escreva só o endereço, por exemplo painel.seunegocio.com.br.' };
  }
  if (/^\d+$/.test(parts.at(-1)!)) return { ok: false, error: 'Use um nome, não um número de IP.' };
  if (domain === 'localhost' || domain.endsWith('.nexo.app') || domain.includes('nexo')) {
    return { ok: false, error: 'Use um endereço do seu negócio.' };
  }
  return { ok: true, domain };
}

/** Registro DNS que prova que o domínio é do negócio. */
export const DOMAIN_TXT_PREFIX = '_nexo-verificacao';
