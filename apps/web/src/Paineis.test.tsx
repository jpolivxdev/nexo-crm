import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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
  features: [
    'report',
    'agenda',
    'bot',
    'reminders',
    'team_roles',
    'crm_plus',
    'contacts_plus',
    'dashboards',
  ],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const numbers = (o: object = {}) => ({
  newContacts: 12,
  newDeals: 10,
  wonCount: 4,
  wonCents: 92000,
  lostCount: 1,
  conversion: 80,
  doneCount: 30,
  revenueCents: 540000,
  noShowCount: 2,
  averageTicketCents: 18000,
  ...o,
});

const DASH = {
  period: 'month',
  from: '2026-11-01',
  to: '2026-11-30',
  pipeline: { id: 'p1', name: 'Atendimentos' },
  pipelines: [{ id: 'p1', name: 'Atendimentos', isDefault: true }],
  people: [{ id: 'u-ana', name: 'Ana (demo)' }],
  numbers: numbers(),
  previous: numbers({ newContacts: 8 }),
  changes: { newContacts: 50, wonCount: 0, doneCount: -10, revenueCents: 20 },
  goals: { wonCount: 8, revenueCents: 1000000 },
  progress: { newContacts: 12, wonCount: 4, doneCount: 30, revenueCents: 540000 },
  funnel: [
    { id: 's1', name: 'Novo contato', reached: 10, percent: 100 },
    { id: 's2', name: 'Agendou', reached: 6, percent: 60 },
    { id: 's3', name: 'Atendido', reached: 4, percent: 40 },
  ],
  byOwner: [{ id: 'u-ana', name: 'Ana (demo)', openDeals: 3, openCents: 69000, openTasks: 2 }],
  forecast: { count: 3, openCents: 69000, weightedCents: 30000, byMonth: [] },
};

const OVERVIEW = {
  stages: [
    { id: 's1', name: 'Novo contato', kind: 'OPEN', count: 5 },
    { id: 's2', name: 'Agendou', kind: 'OPEN', count: 3 },
  ],
  forecast: { count: 8, openCents: 100000, weightedCents: 45000, byMonth: [] },
  monthRevenueCents: 540000,
  openTickets: 1,
};

const TODAY = {
  date: '2026-11-09',
  timeZone: 'America/Sao_Paulo',
  appointments: [],
  handoffs: [],
  tasks: [],
  activity: [],
};

function mockApi(me = ME) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      let out: unknown;
      if (url.endsWith('/auth/me')) out = me;
      else if (url.includes('/crm/dashboard/goals')) out = body;
      else if (url.includes('/crm/dashboard')) out = DASH;
      else if (url.endsWith('/crm/overview')) out = OVERVIEW;
      else if (url.endsWith('/panel/today')) out = TODAY;
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

describe('Premium: Painéis', () => {
  it('mostra indicadores, metas e funil; troca o período e salva metas', async () => {
    const calls = mockApi();
    window.location.hash = '/paineis';
    const user = userEvent.setup();
    render(<App />);
    const kpis = await screen.findByRole('list', { name: 'Indicadores do período' });
    expect(within(kpis).getByText('R$ 5.400,00')).toBeInTheDocument();
    expect(within(kpis).getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Atendimentos fechados' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    const funnel = screen.getByRole('list', { name: /Funil de conversão/ });
    expect(within(funnel).getByText('Agendou')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(calls.some((c) => c.url.includes('period=week'))).toBe(true);

    await user.click(screen.getByRole('button', { name: /Metas/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Metas da semana' });
    await user.type(within(sheet).getByLabelText('Novos contatos'), '20');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar metas' }));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      period: 'week',
      goals: { newContacts: 20, wonCount: 8, doneCount: null, revenueCents: 1000000 },
    });
  });

  it('Modo TV abre em tela cheia e sai com o botão', async () => {
    mockApi();
    window.location.hash = '/paineis';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Modo TV/ }));
    const tv = screen.getByRole('dialog', { name: 'Modo TV' });
    expect(within(tv).getByText('R$ 5.400,00')).toBeInTheDocument();
    await user.click(within(tv).getByRole('button', { name: /Sair do Modo TV/ }));
    expect(screen.queryByRole('dialog', { name: 'Modo TV' })).toBeNull();
  });

  it('Hoje mostra o painel geral no Premium', async () => {
    mockApi();
    window.location.hash = '/hoje';
    render(<App />);
    const panel = await screen.findByRole('region', { name: 'Painel geral' });
    expect(within(panel).getByText('R$ 450,00')).toBeInTheDocument();
    expect(within(panel).getByRole('list', { name: 'Contatos por etapa' })).toHaveTextContent(
      'Agendou3',
    );
  });
});
