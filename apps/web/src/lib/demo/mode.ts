/**
 * Modo demonstração: o painel (Básico ou Premium) roda no navegador com dados fictícios, sem servidor.
 * Fica ligado só nesta aba (sessionStorage) e nada é guardado: recarregar a página recomeça a demo.
 */
const KEY = 'nexo-demo';
const TOUR_KEY = 'nexo-demo-tour';

let active: 'basic' | 'premium' | false | null = null;

function mode(): 'basic' | 'premium' | false {
  if (active === null) {
    try {
      const v = window.sessionStorage.getItem(KEY);
      active = v === '1' ? 'basic' : v === 'premium' ? 'premium' : false;
    } catch {
      active = false;
    }
  }
  return active;
}

export function isDemo(): boolean {
  return mode() !== false;
}

/** Demonstração do plano Premium (mesmo negócio fictício, com tudo do Premium ligado). */
export function isPremiumDemo(): boolean {
  return mode() === 'premium';
}

export function enterDemo(premium = false): void {
  active = premium ? 'premium' : 'basic';
  try {
    window.sessionStorage.setItem(KEY, premium ? 'premium' : '1');
    window.sessionStorage.setItem(TOUR_KEY, '1');
  } catch {
    // sem armazenamento: a demo vale até recarregar
  }
}

export function leaveDemo(): void {
  active = false;
  try {
    window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(TOUR_KEY);
  } catch {
    // nada a limpar
  }
}

/** O tour geral da demo abre uma vez, logo ao entrar. */
export function takeDemoTour(): boolean {
  try {
    const pending = window.sessionStorage.getItem(TOUR_KEY) === '1';
    window.sessionStorage.removeItem(TOUR_KEY);
    return pending;
  } catch {
    return false;
  }
}
