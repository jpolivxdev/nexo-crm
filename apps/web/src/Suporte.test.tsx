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
const ADMIN = { ...OWNER, name: 'JP (nexo)', role: 'NEXO_ADMIN', businessName: null };
const TID = '22222222-2222-4222-8222-222222222222';
const TICKET = {
  id: TID,
  topic: 'problema',
  subject: 'Lembrete não chegou',
  status: 'ANSWERED',
  ownerUnread: true,
  createdAt: '2031-01-07T12:00:00Z',
  updatedAt: '2031-01-07T13:00:00Z',
};
const MESSAGES = [
  {
    id: 'm1',
    authorType: 'owner',
    authorName: 'Ana (demo)',
    body: 'A cliente não recebeu.',
    createdAt: '2031-01-07T12:00:00Z',
  },
  {
    id: 'm2',
    authorType: 'nexo',
    authorName: 'JP',
    body: 'Já olhamos, faltava o DDD.',
    createdAt: '2031-01-07T13:00:00Z',
  },
];

function mock(me: object) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^\/api/, '');
    let body: unknown = {};
    let status = 200;
    if (path === '/auth/me') body = me;
    else if (path === '/panel/support/unread') body = { count: 1 };
    else if (path === '/panel/support' && init?.method === 'POST') {
      status = 201;
      body = { ...TICKET, status: 'OPEN', ownerUnread: false };
    } else if (path === '/panel/support') body = [TICKET];
    else if (path === `/panel/support/${TID}`) body = { ...TICKET, messages: MESSAGES };
    else if (path.startsWith('/admin/support?'))
      body = {
        tickets: [
          { ...TICKET, status: 'OPEN', tenantId: 't1', tenantName: 'Estúdio Exemplo (demo)' },
        ],
        counts: { OPEN: 1 },
      };
    else if (path === `/admin/support/${TID}`)
      body = {
        ...TICKET,
        status: 'OPEN',
        tenantName: 'Estúdio Exemplo (demo)',
        messages: MESSAGES,
      };
    else status = 404;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('suporte', () => {
  it('a dona abre um chamado e lê a resposta da nexo', async () => {
    const fetchMock = mock(OWNER);
    window.location.hash = '#/suporte';
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Lembrete não chegou')).toBeInTheDocument();
    expect(screen.getByText('Respondido')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }));
    const form = screen.getByRole('form', { name: 'Abrir chamado' });
    await user.selectOptions(within(form).getByLabelText('Assunto'), 'duvida');
    await user.type(within(form).getByLabelText('Resumo'), 'Como mudo meu horário?');
    await user.type(
      within(form).getByLabelText('O que aconteceu'),
      'Quero abrir mais cedo no sábado.',
    );
    await user.click(within(form).getByRole('button', { name: 'Enviar chamado' }));
    const post = fetchMock.mock.calls.find(
      ([u, i]) => String(u).endsWith('/panel/support') && i?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      topic: 'duvida',
      subject: 'Como mudo meu horário?',
      description: 'Quero abrir mais cedo no sábado.',
    });

    expect(await screen.findByText('Já olhamos, faltava o DDD.')).toBeInTheDocument();
    expect(screen.getByText('JP · nexo')).toBeInTheDocument();
  });

  it('o admin nexo vê os chamados de todos os negócios e responde', async () => {
    const fetchMock = mock(ADMIN);
    window.location.hash = '#/suporte';
    const user = userEvent.setup();
    render(<App />);

    const row = await screen.findByRole('link', { name: /Lembrete não chegou/ });
    expect(within(row).getByText(/Estúdio Exemplo \(demo\)/)).toBeInTheDocument();
    await user.click(row);
    await user.type(await screen.findByLabelText('Responder a dona'), 'Pode testar de novo?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    const sent = fetchMock.mock.calls.find(
      ([u, i]) => String(u).endsWith(`/admin/support/${TID}/messages`) && i?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ body: 'Pode testar de novo?' });
  });
});
