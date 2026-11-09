import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const GERAL = '11111111-1111-4111-8111-111111111111';
const DIRETA = '22222222-2222-4222-8222-222222222222';

const ME = {
  userId: 'u-ana',
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
  plan: 'PREMIUM',
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles', 'team_chat'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const LIST = {
  me: 'u-ana',
  channels: [
    {
      id: GERAL,
      kind: 'channel',
      name: 'Geral',
      general: true,
      withUserId: null,
      createdById: 'u-ana',
      unread: 2,
      last: { authorName: 'Bia (demo)', body: 'Cheguei!', at: '2026-11-09T12:00:00.000Z' },
    },
  ],
  directs: [
    {
      id: DIRETA,
      kind: 'direct',
      name: 'Bia (demo)',
      general: false,
      withUserId: 'u-bia',
      createdById: 'u-ana',
      unread: 0,
      last: null,
    },
  ],
  people: [{ id: 'u-bia', name: 'Bia (demo)', role: 'STAFF' }],
  unread: 2,
};

const MESSAGES = {
  more: false,
  messages: [
    {
      id: 'm1',
      authorId: 'u-bia',
      authorName: 'Bia (demo)',
      body: 'Cheguei!',
      deleted: false,
      mine: false,
      at: '2026-11-09T12:00:00.000Z',
    },
    {
      id: 'm2',
      authorId: 'u-ana',
      authorName: 'Ana (demo)',
      body: null,
      deleted: true,
      mine: true,
      at: '2026-11-09T12:01:00.000Z',
    },
  ],
};

function mockApi(me: object = ME) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      let out: unknown;
      if (url.endsWith('/auth/me')) out = me;
      else if (url.endsWith('/panel/chat')) out = LIST;
      else if (url.endsWith('/panel/chat/channels')) out = { id: GERAL };
      else if (url.includes('/messages') && method === 'POST') out = { id: 'm3' };
      else if (url.includes('/messages')) out = MESSAGES;
      else if (url.endsWith('/panel/today'))
        out = {
          date: '2026-11-09',
          timeZone: 'America/Sao_Paulo',
          appointments: [],
          handoffs: [],
          tasks: [],
          activity: [],
        };
      else if (url.includes('/support/unread')) out = { count: 0 };
      return new Response(JSON.stringify(out ?? {}), {
        status: out === undefined ? 404 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('Premium: chat da equipe', () => {
  it('lista canais e conversas diretas com o que falta ler', async () => {
    mockApi();
    window.location.hash = '/chat';
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Canais e conversas' });
    const geral = await within(list).findByRole('link', { name: /Geral/ });
    expect(geral).toHaveTextContent('2 novas');
    expect(geral).toHaveTextContent('Bia (demo): Cheguei!');
    expect(within(list).getByRole('link', { name: /^Bia \(demo\)/ })).toHaveTextContent(
      'Sem mensagens ainda',
    );
  });

  it('abre o canal, mostra quem escreveu, mensagem apagada e envia', async () => {
    const calls = mockApi();
    window.location.hash = `/chat/${GERAL}`;
    const user = userEvent.setup();
    render(<App />);
    const msgs = await screen.findByRole('list', { name: 'Mensagens' });
    expect(within(msgs).getByText('Cheguei!')).toBeInTheDocument();
    expect(within(msgs).getByText('Mensagem apagada')).toBeInTheDocument();
    expect(within(msgs).queryByRole('button', { name: 'Apagar mensagem' })).toBeNull();

    await user.type(screen.getByLabelText('Escrever mensagem'), 'Bom dia, equipe{Enter}');
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/messages'))?.body).toEqual({
      body: 'Bom dia, equipe',
    });
    // O Geral não tem "Arquivar".
    expect(screen.queryByRole('button', { name: /Arquivar/ })).toBeNull();
  });

  it('cria canal novo', async () => {
    const calls = mockApi();
    window.location.hash = '/chat';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Novo canal/ }));
    const sheet = screen.getByRole('dialog', { name: 'Novo canal' });
    await user.type(within(sheet).getByLabelText('Nome do canal'), 'Recepção');
    await user.click(within(sheet).getByRole('button', { name: 'Criar canal' }));
    expect(calls.find((c) => c.url.endsWith('/chat/channels'))?.body).toEqual({ name: 'Recepção' });
  });

  it('a profissional também vê o chat; sem o plano, não aparece', async () => {
    mockApi({ ...ME, role: 'STAFF' });
    window.location.hash = '/chat';
    const { unmount } = render(<App />);
    expect(await screen.findByRole('region', { name: 'Canais e conversas' })).toBeInTheDocument();
    unmount();
    vi.unstubAllGlobals();

    mockApi({ ...ME, features: ['report', 'agenda'] });
    window.location.hash = '/chat';
    render(<App />);
    expect(await screen.findByText(/O chat da equipe/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Chat/ })).toBeNull();
  });
});
