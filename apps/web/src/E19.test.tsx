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
const TZ = 'America/Sao_Paulo';
const WINDOWS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080 }));

function mockApi(me: object, routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
      .replace(/^\/api/, '')
      .split('?')[0]!;
    const key = `${init?.method ?? 'GET'} ${path}`;
    const body = path === '/auth/me' ? me : (routes[key]?.(init) ?? {});
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
});

describe('equipe (E19)', () => {
  it('profissional da equipe vê só Hoje e Agenda, sem conversas nem "a fazer"', async () => {
    const fetchMock = mockApi(
      { ...ME, name: 'Bia (demo)', role: 'STAFF' },
      {
        'GET /panel/today': () => ({
          date: '2031-01-15',
          businessName: 'Estúdio Exemplo (demo)',
          timeZone: TZ,
          appointments: [],
          handoffs: [],
          tasks: [],
          activity: [],
        }),
      },
    );
    window.location.hash = '#/clientes';
    render(<App />);

    expect(await screen.findByText('Seu dia de hoje')).toBeInTheDocument();
    for (const nav of screen.getAllByRole('navigation', { name: 'Seções do painel' })) {
      expect(within(nav).getByText('Hoje')).toBeInTheDocument();
      expect(within(nav).getByText('Agenda')).toBeInTheDocument();
      expect(within(nav).queryByText('Clientes')).not.toBeInTheDocument();
    }
    expect(screen.queryByText('A fazer')).not.toBeInTheDocument();
    expect(screen.queryByText('Esperando você')).not.toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(paths.some((p) => p.includes('/panel/report'))).toBe(false);
    expect(paths.some((p) => p.includes('/panel/contacts'))).toBe(false);
  });

  it('adiciona profissional e cria o acesso dela mostrando a senha uma vez', async () => {
    const owner = {
      id: 'p1',
      name: 'Ana (demo)',
      active: true,
      isOwner: true,
      serviceIds: ['s1'],
      windows: WINDOWS,
      login: null,
    };
    let professionals = [owner];
    const fetchMock = mockApi(ME, {
      'GET /panel/team': () => ({
        services: [{ id: 's1', name: 'Fio a fio (demo)' }],
        professionals,
      }),
      'POST /panel/team': () => {
        professionals = [owner, { ...owner, id: 'p2', name: 'Bia (demo)', isOwner: false }];
        return professionals[1];
      },
      'POST /panel/team/p2/login': () => ({
        email: 'bia@exemplo.test',
        temporaryPassword: 'senha-provisoria-demo',
      }),
    });
    window.location.hash = '#/equipe';
    render(<App />);

    expect(await screen.findByText('Sua agenda')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Nome \(como a cliente/), 'Bia (demo)');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Sem acesso ao painel')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Bia (demo)' }));
    expect(screen.getByLabelText('Fio a fio (demo)')).toBeChecked();
    await userEvent.type(screen.getByLabelText('E-mail dela'), 'bia@exemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('senha-provisoria-demo')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/p2/login'));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ email: 'bia@exemplo.test' });
  });
});
