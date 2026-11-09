import { useEffect, useState } from 'react';
import { api } from './api';

/** Marca do negócio (Premium), como vem de /auth/me ou de /public/brand. */
export interface Brand {
  color: string | null;
  font: string | null;
  logoVersion: number | null;
}

const FONTS: Record<string, { titulo: string; texto: string }> = {
  sistema: { titulo: 'system-ui, sans-serif', texto: 'system-ui, sans-serif' },
  classica: {
    titulo: "Georgia, 'Times New Roman', serif",
    texto: "'Inter', system-ui, sans-serif",
  },
};

/**
 * Aplica a marca no painel: cor dos botões e destaques e a fonte. Sem marca, volta para a da
 * nexo. Mexe só em variáveis do tema (nada de estilo inline nas telas).
 */
export function applyBrand(brand: Brand | null | undefined): void {
  const root = document.documentElement.style;
  if (brand?.color) {
    root.setProperty('--roxo-nexo', brand.color);
  } else {
    root.removeProperty('--roxo-nexo');
  }
  const font = brand?.font ? FONTS[brand.font] : undefined;
  if (font) {
    root.setProperty('--fonte-titulo', font.titulo);
    root.setProperty('--fonte-texto', font.texto);
  } else {
    root.removeProperty('--fonte-titulo');
    root.removeProperty('--fonte-texto');
  }
}

export const logoUrl = (version: number) => `/api/panel/brand/logo?v=${version}`;

let publicBrand: Promise<(Brand & { name: string }) | null> | null = null;

/**
 * Tela de entrada no domínio próprio do negócio: busca a marca pelo endereço (uma vez).
 * No endereço da nexo (ou no computador de quem desenvolve), não há marca.
 */
export function usePublicBrand(): (Brand & { name: string }) | null {
  const [brand, setBrand] = useState<(Brand & { name: string }) | null>(null);
  useEffect(() => {
    const host = window.location.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1') return;
    publicBrand ??= api<{ brand: (Brand & { name: string }) | null }>('/public/brand')
      .then((r) => r.brand)
      .catch(() => null);
    let alive = true;
    void publicBrand.then((b) => {
      if (!alive) return;
      setBrand(b);
      applyBrand(b);
    });
    return () => {
      alive = false;
    };
  }, []);
  return brand;
}
