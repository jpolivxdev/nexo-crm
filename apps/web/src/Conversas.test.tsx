import { render, screen, within } from '@testing-library/react';
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
const CID = '11111111-1111-4111-8111-111111111111';
const contact = { id: 'c1', name: 'Cliente Exemplo 1 (demo)', phone: '5500900000001' };

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('conversas', () => {
  it('lista por aba, abre a conversa, responde e arquiva', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api/, '');
      let body: unknown = {};
      if (path === '/auth/me') body = OWNER;
      else if (path.startsWith('/panel/conversations?'))
        body = {
          timeZone: 'America/Sao_Paulo',
          conversations: path.includes('tab=archived')
            ? []
            : [
                {
                  id: CID,
                  channel: 'whatsapp',
                  botPausedAt: '2031-01-07T12:00:00Z',
                  archivedAt: null,
                  lastMessageAt: '2031-01-07T12:00:00Z',
                  contact,
                  lastMessage: {
                    body: '<b>quero falar com a dona</b>',
                    direction: 'INBOUND',
                    createdAt: '2031-01-07T12:00:00Z',
                  },
                },
              ],
        };
      else if (path === `/panel/conversations/${CID}`)
        body = {
          id: CID,
          channel: 'whatsapp',
          botPausedAt: '2031-01-07T12:00:00Z',
          archivedAt: null,
          timeZone: 'America/Sao_Paulo',
          contact: { ...contact, optedOutAt: null },
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              type: 'text',
              body: '<b>quero falar com a dona</b>',
              status: 'processed',
              createdAt: '2031-01-07T12:00:00Z',
            },
          ],
        };
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/conversas';
    const user = userEvent.setup();
    const { container } = render(<App />);

    const list = await screen.findByRole('region', { name: 'Lista de conversas' });
    const row = await within(list).findByRole('link', { name: /Cliente Exemplo 1/ });
    // Texto da cliente aparece como texto, nunca vira marcação.
    expect(within(row).getByText('<b>quero falar com a dona</b>')).toBeInTheDocument();
    expect(container.querySelector('main b')).toBeNull();

    await user.click(row);
    const open = await screen.findByRole('region', { name: 'Conversa aberta' });
    expect(
      await within(open).findByRole('heading', { name: 'Cliente Exemplo 1 (demo)' }),
    ).toBeInTheDocument();
    expect(within(open).getByText('Você está atendendo')).toBeInTheDocument();

    await user.type(within(open).getByRole('textbox'), 'Oi! Já te respondo.');
    await user.click(within(open).getByRole('button', { name: 'Enviar' }));
    const sent = fetchMock.mock.calls.find(
      ([u, i]) => String(u).endsWith('/messages') && i?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ text: 'Oi! Já te respondo.' });

    await user.click(within(open).getByRole('button', { name: /Arquivar/ }));
    const archived = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/archive'));
    expect(JSON.parse(String(archived?.[1]?.body))).toEqual({ archived: true });

    await user.click(within(list).getByRole('button', { name: 'Arquivadas' }));
    expect(await within(list).findByText('Nenhuma conversa arquivada.')).toBeInTheDocument();
  });
});
