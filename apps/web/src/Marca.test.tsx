import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { leaveDemo } from './lib/demo/mode';
import { demoRequest, resetDemo } from './lib/demo/server';

beforeEach(() => {
  resetDemo();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 401 })),
  );
});

afterEach(() => {
  leaveDemo();
  vi.unstubAllGlobals();
  window.location.hash = '';
  document.documentElement.style.removeProperty('--roxo-nexo');
});

async function openPremium() {
  window.location.hash = '/demo-premium';
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Pular tour' }));
  return user;
}

describe('Premium P8: marca, modelos e demo do Premium', () => {
  it('a demo do Premium abre com o plano Premium e as telas da equipe, sem servidor', async () => {
    await openPremium();
    const nav = screen.getAllByRole('navigation')[0]!;
    expect(within(nav).getAllByText('Chat').length).toBeGreaterThan(0);
    expect(within(nav).getAllByText('Wiki').length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: 'Painel geral' })).toBeInTheDocument();

    window.location.hash = '/chat';
    expect(await screen.findByText(/cliente das 15h/)).toBeInTheDocument();

    window.location.hash = '/wiki';
    expect(
      await screen.findByRole('link', { name: /Como receber uma cliente nova/ }),
    ).toBeInTheDocument();
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(calls.every((u) => u.endsWith('/auth/me'))).toBe(true);
  });

  it('marca: cor clara demais trava o botão; cor boa salva e pinta o painel', async () => {
    const user = await openPremium();
    window.location.hash = '/marca';
    const code = await screen.findByLabelText('Código da cor');
    await user.clear(code);
    await user.type(code, '#FFE066');
    expect(screen.getByText(/clara demais para botão/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar marca' })).toBeDisabled();

    await user.clear(code);
    await user.type(code, '#1F6F5C');
    await user.click(screen.getByRole('button', { name: 'Salvar marca' }));
    expect(await screen.findByText('Marca salva. O painel já está com ela.')).toBeInTheDocument();
    expect(await demoRequest('GET', '/panel/brand')).toMatchObject({ color: '#1F6F5C' });
  });

  it('modelos: cria com campo, recusa campo desconhecido e usa na resposta da conversa', async () => {
    const user = await openPremium();
    window.location.hash = '/modelos';
    expect(await screen.findByText('Confirmar horário')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Novo modelo/ })[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'Novo modelo de WhatsApp' });
    await user.type(within(sheet).getByLabelText('Nome do modelo'), 'Agradecer');
    const text = within(sheet).getByLabelText('Texto');
    await user.type(text, 'Obrigada, {{nada}');
    expect(within(sheet).getByText(/Campo desconhecido/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Salvar modelo' })).toBeDisabled();
    await user.clear(text);
    await user.type(text, 'Obrigada pela visita, ');
    await user.click(within(sheet).getByRole('button', { name: '{primeiro_nome}' }));
    expect(within(sheet).getByText('Obrigada pela visita, Bianca')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByText('Agradecer')).toBeInTheDocument();

    const { conversations } = (await demoRequest('GET', '/panel/conversations', {
      tab: 'open',
    })) as { conversations: { id: string; contact: { name: string } }[] };
    const first = conversations[0]!;
    window.location.hash = `/conversas/${first.id}`;
    await user.click(await screen.findByRole('button', { name: 'Usar modelo' }));
    const picker = await screen.findByRole('dialog', { name: 'Usar modelo' });
    await user.click(await within(picker).findByRole('button', { name: /Agradecer/ }));
    const firstName = first.contact.name.split(' ')[0]!;
    await waitFor(() =>
      expect(screen.getByLabelText(/Responder/)).toHaveValue(`Obrigada pela visita, ${firstName}`),
    );
  });

  it('na demo, tocar numa cliente abre a ficha (id da demo na rota)', async () => {
    await openPremium();
    window.location.hash = '/clientes/demo-c-1';
    expect(await screen.findByRole('heading', { name: 'Conversa' })).toBeInTheDocument();
  });
});
