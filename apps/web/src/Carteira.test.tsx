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
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles', 'crm_plus', 'contacts_plus'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const client = (id: string, name: string, status: string, extra: object = {}) => ({
  id,
  name,
  phone: '5515900000000',
  tags: [],
  optedOutAt: null,
  status,
  daysSince: 50,
  visits: 3,
  totalCents: 48000,
  avgIntervalDays: 21,
  lastDoneAt: new Date().toISOString(),
  nextAt: null,
  ...extra,
});

const PORTFOLIO = {
  rules: { attentionDays: 30, riskDays: 45, lostDays: 90 },
  summary: { total: 2, ok: 1, attention: 0, risk: 1, lost: 0, totalCents: 96000 },
  clients: [
    client('11111111-1111-4111-8111-111111111111', 'Bia (demo)', 'risk'),
    client('22222222-2222-4222-8222-222222222222', 'Carla (demo)', 'ok', {
      nextAt: new Date().toISOString(),
    }),
  ],
};

const CHECK = {
  rows: [
    { line: 2, name: 'Lia (demo)', phone: '5515911110001', tags: [], status: 'new' },
    { line: 3, name: 'Bia (demo)', phone: '5515900000000', tags: ['vip'], status: 'existing' },
    { line: 4, name: 'X', phone: null, tags: [], status: 'invalid', reason: 'Telefone inválido' },
  ],
  summary: { total: 3, new: 1, existing: 1, duplicate: 0, invalid: 1 },
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
      else if (url.endsWith('/crm/portfolio')) out = PORTFOLIO;
      else if (url.endsWith('/crm/portfolio/rules')) out = body;
      else if (url.endsWith('/import/check')) out = CHECK;
      else if (url.endsWith('/contacts/import')) out = { created: 1, updated: 1, skipped: 1 };
      else if (url.includes('/panel/contacts')) out = [];
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

describe('Premium: Carteira e importar clientes', () => {
  it('mostra a carteira por situação e salva as regras', async () => {
    const calls = mockApi();
    window.location.hash = '/carteira';
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeInTheDocument();
    const totals = screen.getByRole('list', { name: 'Resumo da carteira' });
    expect(within(totals).getByText('R$ 960,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bia \(demo\)/ })).toHaveTextContent(
      'costuma voltar a cada 21 dias',
    );

    await user.click(screen.getByRole('button', { name: 'Em risco' }));
    expect(screen.queryByRole('button', { name: /Carla \(demo\)/ })).toBeNull();
    expect(screen.getByText(/Mais de 45 dias sem vir/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Regras/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Regras da carteira' });
    await user.clear(within(sheet).getByLabelText('Em risco depois de (dias)'));
    await user.type(within(sheet).getByLabelText('Em risco depois de (dias)'), '60');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar regras' }));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      attentionDays: 30,
      riskDays: 60,
      lostDays: 90,
    });
  });

  it('importa só depois de conferir', async () => {
    const calls = mockApi();
    window.location.hash = '/clientes';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Importar/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Importar clientes' });
    await user.type(
      within(sheet).getByLabelText('Ou cole aqui'),
      'Nome;Telefone{enter}Lia (demo);15911110001',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Conferir' }));
    expect(
      await within(sheet).findByText('Telefone inválido', { exact: false }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/contacts/import'))).toBe(false);
    await user.click(within(sheet).getByRole('button', { name: 'Importar 1 cliente nova' }));
    expect(
      await within(sheet).findByText(/Pronto: 1 cliente nova, 1 com etiquetas novas/),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/contacts/import'))?.body).toMatchObject({
      updateExisting: true,
    });
  });

  it('no Básico não tem Carteira nem importar', async () => {
    mockApi({ ...ME, plan: 'COMPLETE', features: ['report', 'agenda', 'bot', 'reminders'] });
    window.location.hash = '/clientes';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
    for (const nav of screen.getAllByRole('navigation', { name: 'Seções do painel' })) {
      expect(within(nav).queryByRole('link', { name: /Carteira/ })).toBeNull();
    }
  });
});
