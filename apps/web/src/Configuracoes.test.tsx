import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('configurações', () => {
  it('troca o nome, sai dos outros aparelhos e lista o que é do negócio', async () => {
    window.location.hash = '/conta';
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        let body: unknown = {};
        let status = 200;
        if (url.endsWith('/auth/me')) body = ME;
        else if (url.endsWith('/auth/profile') && method === 'POST')
          body = { name: 'Ana Souza', email: 'ana@exemplo.test' };
        else if (url.endsWith('/auth/profile'))
          body = { name: 'Ana', email: 'ana@exemplo.test', twoFactor: false, otherSessions: 2 };
        else if (url.endsWith('/auth/sessions/revoke-others')) body = { revoked: 2 };
        else status = 404;
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    const more = screen.getByRole('navigation', { name: 'Mais configurações' });
    for (const label of ['Dados do negócio', 'Equipe', 'Mensagens do robô', 'Suporte']) {
      expect(within(more).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }

    const name = await screen.findByLabelText('Seu nome');
    expect(screen.getByLabelText('E-mail de acesso')).toHaveValue('ana@exemplo.test');
    await user.clear(name);
    await user.type(name, 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Nome salvo.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/auth/profile') && c.method === 'POST')?.body).toEqual(
      { name: 'Ana Souza' },
    );

    expect(screen.getByText(/2 outros aparelhos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair dos outros aparelhos' }));
    expect(await screen.findByText('Pronto: 2 aparelhos saíram do painel.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair dos outros aparelhos' })).toBeDisabled();
  });
});
