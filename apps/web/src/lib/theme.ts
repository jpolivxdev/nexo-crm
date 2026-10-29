import { useSyncExternalStore } from 'react';

/** Tema do painel. Fica só neste aparelho (preferência visual, sem dado de negócio). */
export type ThemePref = 'claro' | 'escuro' | 'sistema';
export type Theme = 'claro' | 'escuro';

const KEY = 'nexo-tema';
const listeners = new Set<() => void>();

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

export function readThemePref(): ThemePref {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === 'claro' || value === 'escuro' || value === 'sistema') return value;
  } catch {
    // navegação privada ou armazenamento bloqueado: fica no padrão
  }
  return 'claro';
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref !== 'sistema') return pref;
  return darkQuery()?.matches ? 'escuro' : 'claro';
}

/** Aplica o tema na página (atributo data-theme no <html>). */
export function applyTheme(pref: ThemePref = readThemePref()): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
  listeners.forEach((fn) => fn());
}

export function setThemePref(pref: ThemePref): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // sem armazenamento: vale só até fechar a página
  }
  applyTheme(pref);
}

/** Acompanha o celular quando a escolha é "Igual ao celular". Chamar uma vez, na entrada. */
export function followSystemTheme(): void {
  darkQuery()?.addEventListener('change', () => {
    if (readThemePref() === 'sistema') applyTheme('sistema');
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tema em uso agora (já resolvido), para componentes que mudam de desenho, como o logo. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'escuro' ? 'escuro' : 'claro'),
    () => 'claro',
  );
}

/** Escolha da pessoa (claro, escuro ou igual ao celular). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readThemePref, () => 'claro');
}
