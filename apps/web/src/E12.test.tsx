import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;

/** Sem sessão; /auth/options responde o que o teste pedir. */
function mockApi(
  options: { signupEnabled: boolean; passwordResetEnabled: boolean },
  extra?: Handler,
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra?.(url, init);
    const { status, body } = custom
      ? custom
      : url.endsWith('/auth/me')
        ? { status: 401, body: {} }
        : url.endsWith('/auth/options')
          ? { status: 200, body: options }
          : { status: 404, body: { message: `não esperado: ${url}` } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, path: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));
  return call ? JSON.parse(String(call[1]?.body)) : null;
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('página de entrada, criar conta e esqueci a senha (E12)', () => {
  it('sem endereço, mostra a página de entrada com os caminhos para entrar e criar conta', async () => {
    mockApi({ signupEnabled: true, passwordResetEnabled: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /Seu cliente marca horário/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Em fase de testes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Entrar no painel/ })).toHaveAttribute(
      'href',
      '#/entrar',
    );
    expect(await screen.findAllByRole('link', { name: 'Criar conta' })).not.toHaveLength(0);
    expect(screen.getByText('Painel com dados de exemplo.')).toBeInTheDocument();
  });

  it('com o cadastro desligado, não oferece criar conta nem esqueci a senha', async () => {
    mockApi({ signupEnabled: false, passwordResetEnabled: false });
    window.location.hash = '/entrar';
    render(<App />);
    await screen.findByRole('heading', { name: 'Entrar no painel' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('link', { name: 'Criar conta' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Esqueci a senha' })).toBeNull();
  });

  it('criar conta confere os campos antes de mandar e depois pede para olhar o e-mail', async () => {
    const fetchMock = mockApi({ signupEnabled: true, passwordResetEnabled: true }, (url) =>
      url.endsWith('/auth/signup') ? { status: 202, body: { ok: true } } : undefined,
    );
    window.location.hash = '/criar-conta';
    render(<App />);
    await screen.findByRole('heading', { name: 'Criar conta' });
    const submit = screen.getByRole('button', { name: 'Criar conta' });

    await userEvent.type(screen.getByLabelText('Nome do negócio'), 'Estúdio Teste (demo)');
    await userEvent.selectOptions(screen.getByLabelText('Tipo do negócio'), 'cilios');
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Dona Teste');
    await userEvent.type(screen.getByLabelText('E-mail'), 'dona@exemplo.test');
    await userEvent.type(screen.getByLabelText(/^Senha/), 'curta');
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('pelo menos 10 caracteres');

    await userEvent.clear(screen.getByLabelText(/^Senha/));
    await userEvent.type(screen.getByLabelText(/^Senha/), 'senha-bem-forte-1');
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'senha-bem-forte-1');
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('aceite os termos');
    expect(bodyOf(fetchMock, '/auth/signup')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(submit);
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/signup')).toEqual({
      businessName: 'Estúdio Teste (demo)',
      niche: 'cilios',
      ownerName: 'Dona Teste',
      email: 'dona@exemplo.test',
      password: 'senha-bem-forte-1',
      acceptTerms: true,
    });
  });

  it('entrar sem confirmar o e-mail mostra o aviso e deixa pedir o link de novo', async () => {
    const fetchMock = mockApi({ signupEnabled: true, passwordResetEnabled: true }, (url) =>
      url.endsWith('/auth/login')
        ? { status: 403, body: { message: 'Falta confirmar.', emailNotVerified: true } }
        : url.endsWith('/auth/verify-email/resend')
          ? { status: 202, body: { ok: true } }
          : undefined,
    );
    window.location.hash = '/entrar';
    render(<App />);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'dona@exemplo.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-bem-forte-1');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mandar o link de novo' }));
    expect(await screen.findByText('Pronto, mandamos um novo link.')).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/verify-email/resend')).toEqual({ email: 'dona@exemplo.test' });
  });

  it('nova senha pelo link: confere a repetição e manda o token do endereço', async () => {
    const fetchMock = mockApi({ signupEnabled: false, passwordResetEnabled: true }, (url) =>
      url.endsWith('/auth/password/reset') ? { status: 200, body: { ok: true } } : undefined,
    );
    window.location.hash = '/nova-senha?token=token-de-teste-com-tamanho-bom';
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'nova-senha-forte-2');
    await userEvent.type(screen.getByLabelText('Repita a nova senha'), 'outra-coisa-123');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não são iguais');

    await userEvent.clear(screen.getByLabelText('Repita a nova senha'));
    await userEvent.type(screen.getByLabelText('Repita a nova senha'), 'nova-senha-forte-2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByRole('heading', { name: 'Senha nova criada' })).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/password/reset')).toEqual({
      token: 'token-de-teste-com-tamanho-bom',
      newPassword: 'nova-senha-forte-2',
    });
  });

  it('confirmar e-mail gasta o link uma vez só', async () => {
    const fetchMock = mockApi({ signupEnabled: true, passwordResetEnabled: true }, (url) =>
      url.endsWith('/auth/verify-email') ? { status: 200, body: { ok: true } } : undefined,
    );
    window.location.hash = '/confirmar-email?token=token-de-teste-com-tamanho-bom';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'E-mail confirmado' })).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/verify-email'),
    );
    expect(calls).toHaveLength(1);
  });
});
