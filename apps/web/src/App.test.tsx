import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown };

function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ME = { name: 'Ana (demo)', role: 'OWNER', csrfToken: 'csrf-teste' };
const TODAY = {
  date: '2031-01-07',
  businessName: 'Estúdio Exemplo (demo)',
  timeZone: 'America/Sao_Paulo',
  appointments: [
    {
      id: 'a1',
      startsAt: '2031-01-07T12:00:00.000Z',
      endsAt: '2031-01-07T13:00:00.000Z',
      status: 'SCHEDULED',
      source: 'WHATSAPP',
      service: { id: 's1', name: 'Aplicação de cílios (demo)' },
      professional: { id: 'p1', name: 'Ana' },
      contact: { id: 'c1', name: 'Cliente Teste', phone: '5500900000001' },
    },
  ],
  handoffs: [],
  tasks: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('painel', () => {
  it('sem sessão, mostra o login e entra com e-mail e senha', async () => {
    let logged = false;
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/me'))
        return logged ? { status: 200, body: ME } : { status: 401, body: {} };
      if (url.endsWith('/auth/login')) {
        logged = true;
        return { status: 200, body: ME };
      }
      if (url.includes('/panel/today')) return { status: 200, body: TODAY };
      return { status: 404, body: { message: `não esperado: ${init?.method} ${url}` } };
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Entrar no painel' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('E-mail'), 'dona@estudio-exemplo.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-qualquer-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'))!;
    expect(loginCall[1]?.credentials).toBe('same-origin');
  });

  it('mostra os horários do dia no fuso do negócio e marca como realizado com CSRF', async () => {
    let status = 'SCHEDULED';
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: ME };
      if (url.includes('/panel/today')) {
        return {
          status: 200,
          body: { ...TODAY, appointments: [{ ...TODAY.appointments[0], status }] },
        };
      }
      if (url.includes('/panel/appointments/a1/status') && init?.method === 'POST') {
        status = 'DONE';
        return { status: 200, body: {} };
      }
      return { status: 404, body: {} };
    });

    render(<App />);
    expect(await screen.findByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Marcado')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Realizado' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Realizado' })).toBeNull());
    expect(screen.getByText('Realizado')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/status'))!;
    expect((call[1]?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-teste');
  });

  it('mensagem da cliente aparece como texto, nunca como HTML', async () => {
    window.location.hash = '#/clientes/00000000-0000-4000-8000-000000000001';
    mockApi((url) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: ME };
      if (url.includes('/panel/contacts/')) {
        return {
          status: 200,
          body: {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Cliente Teste',
            phone: '5500900000001',
            timeZone: 'America/Sao_Paulo',
            notes: null,
            tags: [],
            optedOutAt: null,
            source: 'WHATSAPP',
            createdAt: '2031-01-01T00:00:00.000Z',
            deal: null,
            appointments: [],
            tasks: [],
            conversations: [
              {
                id: 'conv1',
                channel: 'whatsapp',
                botPausedAt: null,
                messages: [
                  {
                    id: 'm1',
                    direction: 'INBOUND',
                    type: 'text',
                    body: '<img src=x onerror=alert(1)>',
                    status: 'processed',
                    createdAt: '2031-01-01T12:00:00.000Z',
                  },
                ],
              },
            ],
          },
        };
      }
      return { status: 404, body: {} };
    });

    const { container } = render(<App />);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
