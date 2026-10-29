import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const RULES = {
  stages: [
    { id: 's-novo', name: 'Novo contato' },
    { id: 's-agendou', name: 'Agendou' },
    { id: 's-nao', name: 'Não seguiu' },
  ],
  rules: [
    { event: 'appointment.created', defaultStageId: 's-agendou' },
    { event: 'appointment.no_show', defaultStageId: null },
    { event: 'faq.viewed', defaultStageId: null, stageId: null },
  ],
};

describe('regras automáticas de etapa (E16)', () => {
  it('mostra o padrão, deixa trocar e manda só o que não é padrão', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      const path = String(url).replace(/^\/api/, '');
      return json(path === '/auth/me' ? OWNER : RULES);
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/regras';
    render(<App />);

    const created = await screen.findByLabelText(/marcou horário/);
    expect(created).toHaveDisplayValue('Padrão (Agendou)');
    expect(screen.getByLabelText(/viu as dúvidas/)).toHaveDisplayValue('Não mudar a etapa');
    await userEvent.selectOptions(screen.getByLabelText(/faltou/), 'Não seguiu');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));

    expect(await screen.findByText(/Regras salvas/)).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      rules: [
        { event: 'appointment.no_show', stageId: 's-nao' },
        { event: 'faq.viewed', stageId: null },
      ],
    });
  });
});

describe('visões de clientes (E17)', () => {
  it('troca para "Sumidas", explica a regra e mostra há quantos dias', async () => {
    const lastDoneAt = new Date(Date.now() - 62 * 86_400_000).toISOString();
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://x');
      if (u.pathname.endsWith('/auth/me')) return json(OWNER);
      if (u.searchParams.get('segment') === 'missing') {
        return json([
          {
            id: 'c1',
            name: 'Cliente Sumida (demo)',
            phone: '5500900000001',
            optedOutAt: null,
            deals: [],
            stats: { lastDoneAt },
          },
        ]);
      }
      return json([]);
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/clientes';
    render(<App />);

    expect(await screen.findByText('Nenhuma cliente ainda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sumidas' }));
    expect(await screen.findByText('Cliente Sumida (demo)')).toBeInTheDocument();
    expect(screen.getByText('Última vez há 62 dias')).toBeInTheDocument();
    expect(screen.getByText(/há mais de 45 dias/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sumidas' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Faltosas' }));
    expect(await screen.findByText('Nenhuma cliente em "Faltosas"')).toBeInTheDocument();
  });
});
