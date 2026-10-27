import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { applyTheme, readThemePref } from './lib/theme';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

const REPORT = (days: number) => ({
  from: days === 7 ? '2031-01-09' : '2030-12-17',
  to: '2031-01-15',
  days,
  newContacts: days === 7 ? 3 : 12,
  booked: { total: 8, byBot: 6, byPanel: 2 },
  outcomes: { done: 3, noShow: 1, cancelled: 1, noShowRate: 25 },
  handoffs: 2,
  optOuts: 1,
  confirmedByClient: 4,
  byStage: [
    { id: 's1', name: 'Novo contato', count: 5 },
    { id: 's2', name: 'Agendou', count: 2 },
  ],
  byProfessional: [{ id: 'p1', name: 'Profissional Exemplo (demo)', count: 4 }],
});

function mockApi() {
  const fetchMock = vi.fn(async (url: string) => {
    const days = Number(new URL(url, 'http://x').searchParams.get('days') ?? 30);
    const body = url.endsWith('/auth/me')
      ? OWNER
      : url.includes('/panel/report')
        ? REPORT(days)
        : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
  window.localStorage.clear();
  applyTheme('claro');
});

describe('resultados (E11)', () => {
  it('mostra o que o robô marcou, faltas e pedidos, e troca o período', async () => {
    const fetchMock = mockApi();
    window.location.hash = '#/resultados';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    const booked = await screen.findByRole('region', { name: 'Horários marcados' });
    expect(within(booked).getByText('Pelo robô').nextSibling).toHaveTextContent('6');
    expect(within(booked).getByText(/marcou 75% dos 8 horários/)).toBeInTheDocument();
    expect(screen.getByText(/Taxa de faltas: 25%/)).toBeInTheDocument();
    expect(screen.getByText('4 clientes confirmaram o horário pelo lembrete.')).toBeInTheDocument();
    const stages = screen.getByRole('region', { name: 'Clientes em cada etapa (agora)' });
    expect(within(stages).getByText('Novo contato')).toBeInTheDocument();
    // Uma profissional só: não mostra o quadro por profissional.
    expect(screen.queryByText('Atendimentos por profissional')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() =>
      expect(screen.getByText('Novos contatos').nextSibling).toHaveTextContent('3'),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('days=7'))).toBe(true);
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('modo escuro', () => {
  it('a dona escolhe em Conta, o painel muda na hora e a escolha fica no aparelho', async () => {
    mockApi();
    window.location.hash = '#/conta';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Aparência' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('claro');
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Escuro' }));
    expect(document.documentElement.dataset.theme).toBe('escuro');
    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'true');
    expect(readThemePref()).toBe('escuro');
  });

  it('"Igual ao celular" segue o tema do aparelho', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    mockApi();
    window.location.hash = '#/conta';
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Igual ao celular' }));
    expect(document.documentElement.dataset.theme).toBe('escuro');
  });
});

describe('plano e assinatura (só visual)', () => {
  it('mostra os planos como prévia, sem preço inventado e sem botão de compra ativo', async () => {
    mockApi();
    window.location.hash = '#/assinatura';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Plano e assinatura' })).toBeInTheDocument();
    expect(screen.getByText(/Nada é cobrado por enquanto/)).toBeInTheDocument();
    expect(screen.getAllByText('R$ —')).toHaveLength(3);
    for (const button of screen.getAllByRole('button', { name: /Seu plano atual|Em breve/ })) {
      expect(button).toBeDisabled();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Anual' }));
    expect(screen.getAllByText('/ ano')).toHaveLength(3);
  });
});
