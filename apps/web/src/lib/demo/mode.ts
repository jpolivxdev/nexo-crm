/**
 * Modo demonstração: o painel do plano básico roda no navegador com dados fictícios, sem servidor.
 * Fica ligado só nesta aba (sessionStorage) e nada é guardado: recarregar a página recomeça a demo.
 */
const KEY = 'nexo-demo';
const TOUR_KEY = 'nexo-demo-tour';

let active: boolean | null = null;

export function isDemo(): boolean {
  if (active === null) {
    try {
      active = window.sessionStorage.getItem(KEY) === '1';
    } catch {
      active = false;
    }
  }
  return active;
}

export function enterDemo(): void {
  active = true;
  try {
    window.sessionStorage.setItem(KEY, '1');
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
