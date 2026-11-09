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
  plan: 'PREMIUM',
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const RULES = {
  MANAGER: { reports: true, settings: true, privacy: true },
  CONSULTANT: { reports: true, settings: false, privacy: false },
  STAFF: { reports: false, settings: false, privacy: false },
};

type Handler = (url: string, method: string, body: unknown) => unknown;

function mockApi(handler: Handler) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      const out = handler(url, method, body);
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

describe('Premium: papéis, acessos e verificação em duas etapas', () => {
  it('consultor não vê configurações do negócio, equipe nem resultados quando o dono desliga', async () => {
    mockApi((url) =>
      url.endsWith('/auth/me')
        ? { ...ME, role: 'CONSULTANT', access: [] }
        : url.endsWith('/auth/profile')
          ? { name: 'Bia', email: 'bia@exemplo.test', twoFactor: false, otherSessions: 0 }
          : {},
    );
    window.location.hash = '/conta';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    const more = screen.getByRole('navigation', { name: 'Mais configurações' });
    expect(within(more).queryByRole('link', { name: /Dados do negócio/ })).toBeNull();
    expect(within(more).queryByRole('link', { name: /Equipe/ })).toBeNull();
    expect(within(more).queryByRole('link', { name: /Acessos/ })).toBeNull();
    expect(within(more).getByRole('link', { name: /Suporte/ })).toBeInTheDocument();
    for (const nav of screen.getAllByRole('navigation', { name: 'Seções do painel' })) {
      expect(within(nav).queryByRole('link', { name: /Resultados/ })).toBeNull();
      expect(within(nav).getByRole('link', { name: /Clientes/ })).toBeInTheDocument();
    }

    window.location.hash = '/equipe';
    expect(
      await screen.findByRole('heading', { name: 'Esta parte não está liberada para você' }),
    ).toBeInTheDocument();
  });

  it('o dono liga e desliga áreas por papel e salva', async () => {
    const calls = mockApi((url, method) =>
      url.endsWith('/auth/me')
        ? ME
        : url.endsWith('/panel/access') && method === 'GET'
          ? { available: true, rules: RULES, requireMfa: false }
          : url.endsWith('/panel/access')
            ? { available: true, rules: RULES, requireMfa: false }
            : {},
    );
    window.location.hash = '/acessos';
    const user = userEvent.setup();
    render(<App />);
    const consultantReports = await screen.findByRole('switch', {
      name: 'Resultados e metas: Consultor',
    });
    expect(consultantReports).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Resultados e metas: Profissional' })).toBeDisabled();
    await user.click(consultantReports);
    await user.click(screen.getByRole('button', { name: 'Salvar acessos' }));
    expect(await screen.findByText(/Acessos salvos/)).toBeInTheDocument();
    const put = calls.find((c) => c.url.endsWith('/panel/access') && c.method === 'PUT');
    expect(put?.body).toEqual({
      rules: { ...RULES, CONSULTANT: { ...RULES.CONSULTANT, reports: false } },
      requireMfa: false,
    });
  });

  it('liga a verificação em duas etapas com o código do app', async () => {
    const calls = mockApi((url) =>
      url.endsWith('/auth/me')
        ? ME
        : url.endsWith('/auth/profile')
          ? { name: 'Ana', email: 'ana@exemplo.test', twoFactor: false, otherSessions: 0 }
          : url.endsWith('/auth/2fa/start')
            ? { secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/nexo:Ana?secret=ABCDEFGHIJKLMNOP' }
            : url.endsWith('/auth/2fa/enable')
              ? { ...ME, twoFactor: true }
              : {},
    );
    window.location.hash = '/conta';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ligar verificação' }));
    expect(await screen.findByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código de 6 dígitos do app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Ligar verificação' }));
    expect(await screen.findByText(/Verificação ligada/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/auth/2fa/enable'))?.body).toEqual({
      secret: 'ABCDEFGHIJKLMNOP',
      code: '123456',
    });
  });

  it('negócio que exige 2FA: quem não ligou só vê a tela de ligar', async () => {
    mockApi((url) => (url.endsWith('/auth/me') ? { ...ME, mfaSetupRequired: true } : {}));
    render(<App />);
    expect(
      await screen.findByText(/O negócio exige a verificação em duas etapas/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Seções do painel' })).toBeNull();
  });
});
