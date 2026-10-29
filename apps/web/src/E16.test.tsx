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
