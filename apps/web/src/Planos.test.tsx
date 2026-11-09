import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ME = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

const TODAY = {
  date: '2031-01-15',
  timeZone: 'America/Sao_Paulo',
  appointments: [],
  handoffs: [],
  tasks: [],
  counts: { appointments: 0, done: 0, noShow: 0, handoffs: 0, tasks: 0 },
};

function mockApi(me: object) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.endsWith('/auth/me') ? me : url.includes('/panel/today') ? TODAY : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('o painel segue o plano do negócio', () => {
  it('plano Grátis: some Agenda e Resultados do menu; abrir pelo link mostra o aviso', async () => {
    mockApi({ ...ME, plan: 'FREE', features: [] });
    window.location.hash = '#/agenda';
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'A agenda não faz parte do seu plano' }),
    ).toBeInTheDocument();
    // Menu lateral (computador) e barra de baixo (celular) seguem a mesma regra.
    for (const nav of screen.getAllByRole('navigation', { name: 'Seções do painel' })) {
      expect(within(nav).queryByRole('link', { name: /Agenda/ })).toBeNull();
      expect(within(nav).queryByRole('link', { name: /Resultados/ })).toBeNull();
      expect(within(nav).getByRole('link', { name: /Clientes/ })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Ver planos' })).toBeInTheDocument();
  });

  it('a tela de planos mostra Básico e Premium e marca o plano atual', async () => {
    mockApi({ ...ME, plan: 'COMPLETE', features: ['report'] });
    window.location.hash = '#/assinatura';
    render(<App />);
    const basico = await screen.findByRole('listitem', { name: 'Básico' });
    expect(within(basico).getByRole('button', { name: 'Seu plano atual' })).toBeDisabled();
    const premium = screen.getByRole('listitem', { name: 'Premium' });
    expect(within(premium).getByRole('button', { name: 'Em construção' })).toBeDisabled();
    expect(screen.queryByRole('listitem', { name: 'Completo' })).toBeNull();
  });
});
