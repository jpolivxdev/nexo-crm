import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { parseMoney } from './screens/CrmPremium';

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
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles', 'crm_plus'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const MAIN = '11111111-1111-4111-8111-111111111111';
const NOIVAS = '22222222-2222-4222-8222-222222222222';
const FIELD = '33333333-3333-4333-8333-333333333333';

const stage = (id: string, name: string, kind = 'OPEN', probability: number | null = 50) => ({
  id,
  name,
  key: null,
  kind,
  probability,
});

const PIPELINES = [
  {
    id: MAIN,
    name: 'Atendimentos',
    isDefault: true,
    openDeals: 2,
    stages: [stage('s1', 'Novo contato', 'OPEN', 10), stage('s2', 'Agendou', 'OPEN', 60)],
  },
  {
    id: NOIVAS,
    name: 'Noivas (demo)',
    isDefault: false,
    openDeals: 0,
    stages: [stage('n1', 'Novo contato', 'OPEN', 10), stage('n2', 'Fechado', 'WON', 100)],
  },
];

const deal = (id: string, name: string, extra: object = {}) => ({
  id,
  since: new Date().toISOString(),
  nextAt: null,
  nextService: null,
  valueCents: null,
  ownValue: false,
  title: null,
  owner: null,
  campaign: null,
  expectedCloseOn: null,
  fields: {},
  nextTask: null,
  contact: { id: `c-${id}`, name, phone: '5515900000000', source: 'WHATSAPP', tags: [] },
  ...extra,
});

const BOARD = {
  id: MAIN,
  name: 'Atendimentos',
  isDefault: true,
  timeZone: 'America/Sao_Paulo',
  forecast: {
    count: 2,
    openCents: 80000,
    weightedCents: 48000,
    byMonth: [{ month: '2026-12', count: 1, openCents: 80000, weightedCents: 48000 }],
  },
  stages: [
    {
      ...stage('s1', 'Novo contato', 'OPEN', 10),
      deals: [
        deal('d1', 'Carla (demo)', {
          contact: {
            id: 'c1',
            name: 'Carla (demo)',
            phone: '5515900000001',
            source: 'PANEL',
            tags: [],
          },
        }),
      ],
    },
    {
      ...stage('s2', 'Agendou', 'OPEN', 60),
      deals: [
        deal('d2', 'Bia (demo)', {
          title: 'Pacote noiva',
          valueCents: 80000,
          ownValue: true,
          owner: { id: 'u-ana', name: 'Ana (demo)' },
          campaign: { id: 'camp1', name: 'Verão (demo)' },
          expectedCloseOn: '2026-12-05',
          fields: { [FIELD]: 'Casamento' },
          nextTask: { id: 't1', title: 'Confirmar a prova', kind: 'call', dueAt: null },
        }),
      ],
    },
  ],
};

const CAMPAIGNS = [
  {
    id: 'camp1',
    name: 'Verão (demo)',
    channel: 'Instagram',
    startsOn: '2026-11-10',
    endsOn: '2026-12-20',
    budgetCents: 30000,
    archivedAt: null,
    pipeline: { id: NOIVAS, name: 'Noivas (demo)' },
    deals: 1,
    won: 0,
    wonCents: 0,
  },
];

const FIELDS = [
  { id: FIELD, label: 'Tipo de evento', type: 'select', options: ['Casamento', 'Formatura'] },
];

const PEOPLE = [
  { id: 'u-ana', name: 'Ana (demo)', role: 'OWNER' },
  { id: 'u-bia', name: 'Bia (demo)', role: 'CONSULTANT' },
];

type Call = { url: string; method: string; body: unknown };

function mockApi(extra: (url: string, method: string, body: unknown) => unknown = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      let out: unknown = extra(url, method, body);
      if (out === undefined) {
        if (url.endsWith('/auth/me')) out = ME;
        else if (url.includes('/panel/pipeline')) out = BOARD;
        else if (url.endsWith('/panel/crm/pipelines') && method === 'GET') out = PIPELINES;
        else if (url.endsWith('/panel/crm/campaigns')) out = CAMPAIGNS;
        else if (url.endsWith('/panel/crm/fields')) out = FIELDS;
        else if (url.endsWith('/panel/crm/people')) out = PEOPLE;
        else if (url.includes('/panel/crm/tasks') && method === 'GET') out = [];
        else if (url.includes('/support/unread')) out = { count: 0 };
        else if (method !== 'GET') out = { ok: true, id: 'novo' };
      }
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
  window.localStorage.clear();
});

describe('Premium: CRM completo', () => {
  it('valor em reais vira centavos', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('150')).toBe(15000);
    expect(parseMoney('R$ 150,5')).toBe(15050);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('cento e cinquenta')).toBeNaN();
  });

  it('mostra totais, dono e campanha no cartão, filtra os meus e edita o atendimento', async () => {
    const calls = mockApi();
    window.location.hash = '/etapas';
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('combobox', { name: 'Funil' })).toHaveValue(MAIN);
    const totals = screen.getByRole('list', { name: 'Resumo do funil' });
    expect(within(totals).getByText('R$ 800,00')).toBeInTheDocument();
    expect(within(totals).getByText('R$ 480,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pacote noiva' })).toBeInTheDocument();
    expect(screen.getByText('Verão (demo)', { selector: '.deal__campaign' })).toBeInTheDocument();
    expect(screen.getByText(/Ligar: Confirmar a prova/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Meus atendimentos' }));
    expect(screen.queryByRole('button', { name: 'Carla (demo)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pacote noiva' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Meus atendimentos' }));

    await user.click(screen.getByRole('button', { name: 'Pacote noiva' }));
    const panel = await screen.findByRole('dialog', { name: 'Pacote noiva' });
    expect(within(panel).getByLabelText('Valor (R$)')).toHaveValue('800,00');
    expect(within(panel).getByLabelText('Tipo de evento')).toHaveValue('Casamento');
    await user.clear(within(panel).getByLabelText('Valor (R$)'));
    await user.type(within(panel).getByLabelText('Valor (R$)'), '950');
    await user.selectOptions(within(panel).getByLabelText('Responsável'), 'u-bia');
    await user.click(within(panel).getByRole('button', { name: 'Salvar' }));
    expect(await within(panel).findByText('Atendimento salvo.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT' && c.url.includes('/crm/deals/d2'))?.body).toEqual({
      title: 'Pacote noiva',
      valueCents: 95000,
      ownerUserId: 'u-bia',
      campaignId: 'camp1',
      expectedCloseOn: '2026-12-05',
      fields: { [FIELD]: 'Casamento' },
    });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Previsão/ }));
    const forecast = await screen.findByRole('dialog', { name: 'Previsão de fechamento' });
    expect(within(forecast).getByText('Dezembro de 2026')).toBeInTheDocument();
  });

  it('cria atendimento, troca de funil e cria funil novo', async () => {
    const calls = mockApi((url, method) =>
      url.endsWith('/panel/crm/pipelines') && method === 'POST' ? { id: NOIVAS } : undefined,
    );
    window.location.hash = '/etapas';
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Novo atendimento' }));
    const form = await screen.findByRole('dialog', { name: 'Novo atendimento' });
    await user.type(within(form).getByLabelText('Nome da cliente'), 'Dani (demo)');
    await user.type(within(form).getByLabelText('Telefone com DDD'), '15 99999-0000');
    await user.type(within(form).getByLabelText('Valor (R$)'), '230');
    await user.click(within(form).getByRole('button', { name: 'Salvar atendimento' }));
    expect(
      calls.find((c) => c.method === 'POST' && c.url.endsWith('/crm/deals'))?.body,
    ).toMatchObject({
      name: 'Dani (demo)',
      phone: '5515999990000',
      pipelineId: MAIN,
      stageId: 's1',
      valueCents: 23000,
      ownerUserId: 'u-ana',
    });

    await user.click(screen.getByRole('button', { name: 'Novo funil' }));
    const create = await screen.findByRole('dialog', { name: 'Novo funil' });
    await user.type(within(create).getByLabelText('Nome do funil'), 'Noivas (demo)');
    await user.click(within(create).getByRole('button', { name: 'Criar funil' }));
    expect(
      calls.find((c) => c.method === 'POST' && c.url.endsWith('/crm/pipelines'))?.body,
    ).toEqual({ name: 'Noivas (demo)' });
    // Depois de criar, o quadro abre no funil novo.
    expect(
      calls.some(
        (c) => c.method === 'GET' && c.url.includes(`/panel/pipeline?pipelineId=${NOIVAS}`),
      ),
    ).toBe(true);
  });

  it('minhas tarefas agrupa e conclui', async () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const calls = mockApi((url, method) =>
      url.includes('/panel/crm/tasks') && method === 'GET'
        ? [
            {
              id: 't1',
              title: 'Chamar de volta a Carla',
              kind: 'follow_up',
              dueAt: past,
              doneAt: null,
              dealId: null,
              contact: { id: 'c1', name: 'Carla (demo)', phone: '5515900000001' },
              assignee: null,
            },
            {
              id: 't2',
              title: 'Reunião com a fornecedora',
              kind: 'meeting',
              dueAt: null,
              doneAt: null,
              dealId: null,
              contact: null,
              assignee: { id: 'u-ana', name: 'Ana (demo)' },
            },
          ]
        : undefined,
    );
    window.location.hash = '/etapas';
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Minhas tarefas/ }));
    const late = await screen.findByRole('region', { name: 'Atrasadas' });
    expect(within(late).getByText('Chamar de volta a Carla')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sem data' })).toHaveTextContent(
      'Reunião com a fornecedora',
    );
    await user.click(screen.getByRole('button', { name: 'Concluir: Chamar de volta a Carla' }));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/panel/tasks/t1/done'))).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Da equipe' }));
    expect(calls.some((c) => c.url.includes('scope=all'))).toBe(true);
  });

  it('no Básico o quadro continua simples, sem pedir o CRM completo', async () => {
    const calls = mockApi((url) =>
      url.endsWith('/auth/me')
        ? { ...ME, plan: 'COMPLETE', features: ['report', 'agenda', 'bot', 'reminders'] }
        : undefined,
    );
    window.location.hash = '/etapas';
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Nova cliente' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Funil' })).toBeNull();
    expect(calls.some((c) => c.url.includes('/panel/crm/'))).toBe(false);
  });
});
