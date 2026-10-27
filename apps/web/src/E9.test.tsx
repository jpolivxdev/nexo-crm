import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { daysToWindows, parsePrice, windowsToDays } from './screens/Setup';

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

const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? 'null')) as unknown;

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

const TODAY = {
  date: '2031-01-07',
  businessName: 'Estúdio Exemplo (demo)',
  timeZone: 'America/Sao_Paulo',
  appointments: [],
  handoffs: [],
  tasks: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('regras do assistente', () => {
  it('converte preço em reais para centavos', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('150')).toBe(15000);
    expect(parsePrice('150,5')).toBe(15050);
    expect(parsePrice('R$ 99,90')).toBe(9990);
    expect(parsePrice('cento e vinte')).toBe('invalid');
  });

  it('expediente com pausa vira duas janelas e volta igual', () => {
    const days = windowsToDays([]);
    days[2] = { open: true, start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' };
    days[6] = { open: true, start: '08:00', end: '12:00', breakStart: '', breakEnd: '' };
    const windows = daysToWindows(days);
    expect(windows).toEqual([
      { weekday: 2, startMinute: 540, endMinute: 720 },
      { weekday: 2, startMinute: 780, endMinute: 1080 },
      { weekday: 6, startMinute: 480, endMinute: 720 },
    ]);
    const back = windowsToDays(windows as never);
    expect(back[2]).toEqual(days[2]);
    expect(back[1]!.open).toBe(false);
  });

  it('recusa pausa fora do expediente e fim antes do início', () => {
    const days = windowsToDays([]);
    days[1] = { open: true, start: '09:00', end: '12:00', breakStart: '13:00', breakEnd: '14:00' };
    expect(daysToWindows(days)).toMatch(/Segunda: a pausa/);
    days[1] = { open: true, start: '12:00', end: '09:00', breakStart: '', breakEnd: '' };
    expect(daysToWindows(days)).toMatch(/Segunda: o fim/);
  });
});

describe('E9 no painel', () => {
  it('senha provisória: obriga a trocar antes de abrir o painel', async () => {
    let me = { ...OWNER, mustChangePassword: true };
    const fetchMock = mockApi((url) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: me };
      if (url.endsWith('/auth/password')) {
        me = { ...OWNER, csrfToken: 'csrf-novo' };
        return { status: 200, body: me };
      }
      if (url.includes('/panel/today')) return { status: 200, body: TODAY };
      return { status: 404, body: {} };
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Crie a sua senha' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();

    await userEvent.type(screen.getByLabelText('Senha provisória'), 'provisoria-123');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'curta');
    await userEvent.type(screen.getByLabelText('Repita a nova senha'), 'curta');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByText(/pelo menos 10 caracteres\./)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/auth/password'))).toBe(false);

    await userEvent.clear(screen.getByLabelText('Nova senha'));
    await userEvent.clear(screen.getByLabelText('Repita a nova senha'));
    await userEvent.type(screen.getByLabelText('Nova senha'), 'uma frase so minha');
    await userEvent.type(screen.getByLabelText('Repita a nova senha'), 'uma frase so minha');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));

    expect(await screen.findByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/password'))!;
    expect(body(call[1])).toEqual({
      currentPassword: 'provisoria-123',
      newPassword: 'uma frase so minha',
    });
  });

  it('negócio sem configuração: aviso no Hoje e assistente até concluir', async () => {
    let me = { ...OWNER, onboardingPending: true };
    let setup = {
      business: {
        name: 'Estúdio Exemplo (demo)',
        attendantName: 'Ana',
        timezone: 'America/Sao_Paulo',
        slotStepMinutes: 30,
        minNoticeMinutes: 60,
      },
      services: [] as unknown[],
      windows: [] as unknown[],
      faq: [] as unknown[],
      onboardingCompletedAt: null as string | null,
    };
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: me };
      if (url.includes('/panel/today')) return { status: 200, body: TODAY };
      if (url.endsWith('/panel/setup')) return { status: 200, body: setup };
      if (url.endsWith('/panel/setup/business')) {
        setup = { ...setup, business: { ...setup.business, ...(body(init) as object) } };
        return { status: 200, body: setup };
      }
      if (url.endsWith('/panel/setup/services')) {
        const { services } = body(init) as { services: object[] };
        setup = { ...setup, services: services.map((s, i) => ({ ...s, id: `s${i}` })) };
        return { status: 200, body: setup };
      }
      if (url.endsWith('/panel/setup/hours')) {
        setup = { ...setup, windows: (body(init) as { windows: unknown[] }).windows };
        return { status: 200, body: setup };
      }
      if (url.endsWith('/panel/setup/faq')) {
        setup = { ...setup, faq: (body(init) as { items: unknown[] }).items };
        return { status: 200, body: setup };
      }
      if (url.endsWith('/panel/setup/complete')) {
        setup = { ...setup, onboardingCompletedAt: '2031-01-07T12:00:00.000Z' };
        me = { ...OWNER };
        return { status: 200, body: setup };
      }
      return { status: 404, body: {} };
    });

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Configurar agora' }));

    // Negócio
    expect(await screen.findByRole('heading', { name: 'Seu negócio' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    // Serviços
    expect(await screen.findByRole('heading', { name: 'Serviços' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nome'), 'Aplicação fio a fio (demo)');
    await userEvent.type(screen.getByLabelText('Preço (R$)'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    // Horários: terça das 9h às 18h
    expect(
      await screen.findByRole('heading', { name: 'Horários de atendimento' }),
    ).toBeInTheDocument();
    const terca = screen.getByRole('group', { name: 'Terça' });
    await userEvent.click(within(terca).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    // Dúvidas: pula
    expect(await screen.findByRole('heading', { name: 'Dúvidas frequentes' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    // Pronto
    expect(await screen.findByText('Aplicação fio a fio (demo) (60 min)')).toBeInTheDocument();
    expect(screen.getByText('terça')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir configuração' }));

    expect(await screen.findByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Configurar agora' })).toBeNull();

    const services = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/setup/services'))!;
    expect(body(services[1])).toEqual({
      services: [{ name: 'Aplicação fio a fio (demo)', durationMinutes: 60, priceCents: 15000 }],
    });
    const hours = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/setup/hours'))!;
    expect(body(hours[1])).toEqual({
      windows: [{ weekday: 2, startMinute: 540, endMinute: 1080 }],
    });
  });

  it('admin nexo: cria negócio, vê a senha provisória uma vez e entra com motivo e código', async () => {
    const ADMIN = { ...OWNER, name: 'Admin (demo)', role: 'NEXO_ADMIN', businessName: null };
    let me: object = ADMIN;
    const tenants = [
      {
        id: '00000000-0000-4000-8000-0000000000aa',
        name: 'Estúdio Exemplo (demo)',
        niche: 'cilios',
        createdAt: '2031-01-01T12:00:00.000Z',
        onboardingStartedAt: '2031-01-01T12:00:00.000Z',
        onboardingCompletedAt: '2031-01-01T12:07:00.000Z',
        onboardingMinutes: 7,
      },
    ];
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: me };
      if (url.endsWith('/admin/tenants') && init?.method === 'POST')
        return {
          status: 201,
          body: {
            tenantId: 'x',
            ownerEmail: 'dona@exemplo.test',
            temporaryPassword: 'senha-provisoria-teste',
          },
        };
      if (url.endsWith('/admin/tenants')) return { status: 200, body: tenants };
      if (url.endsWith(`/admin/tenants/${tenants[0]!.id}/access`)) {
        me = {
          ...ADMIN,
          businessName: 'Estúdio Exemplo (demo)',
          acting: { until: '2031-01-07T13:00:00.000Z' },
        };
        return { status: 200, body: { until: '2031-01-07T13:00:00.000Z' } };
      }
      if (url.endsWith('/admin/access/end')) {
        me = ADMIN;
        return { status: 200, body: { ok: true } };
      }
      if (url.includes('/panel/today')) return { status: 200, body: TODAY };
      return { status: 404, body: {} };
    });

    render(<App />);
    expect(await screen.findByText('Configurado em 7 min', { exact: false })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Criar negócio' }));
    await userEvent.type(screen.getByLabelText('Nome do negócio'), 'Barbearia Exemplo (demo)');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de negócio'), 'barbearia');
    await userEvent.type(screen.getByLabelText('Nome da dona'), 'Dona Teste');
    await userEvent.type(screen.getByLabelText('E-mail da dona (login)'), 'dona@exemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('senha-provisoria-teste')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Já anotei' }));
    expect(screen.queryByText('senha-provisoria-teste')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Entrar para dar suporte' }));
    await userEvent.type(screen.getByLabelText('Motivo'), 'curto');
    await userEvent.type(screen.getByLabelText('Código do app autenticador'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/pelo menos 10 caracteres/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Motivo'), ' — ajudar a cadastrar serviços');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('button', { name: 'Sair do negócio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();

    const access = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/access'))!;
    expect(body(access[1])).toEqual({
      reason: 'curto — ajudar a cadastrar serviços',
      totp: '123456',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Sair do negócio' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Negócios' })).toBeInTheDocument(),
    );
  });
});
