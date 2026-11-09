import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ART = '33333333-3333-4333-8333-333333333333';
const IMG = '44444444-4444-4444-8444-444444444444';
const CAT = '55555555-5555-4555-8555-555555555555';

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
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles', 'wiki'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const LIST = {
  canEdit: true,
  categories: [{ id: CAT, name: 'Procedimentos', count: 1 }],
  total: 1,
  articles: [
    {
      id: ART,
      title: 'Higiene das pinças',
      categoryId: CAT,
      pinned: true,
      updatedAt: '2026-11-09T12:00:00.000Z',
      updatedByName: 'Ana (demo)',
      excerpt: 'Depois de cada cliente Lavar as pinças',
    },
  ],
  usage: { bytes: 2048, max: 104857600 },
};

const ARTICLE = {
  id: ART,
  title: 'Higiene das pinças',
  body: `## Depois de cada cliente\n- Lavar as **pinças**\n<script>alert(1)</script>\n\n![Bancada](anexo:${IMG})`,
  categoryId: CAT,
  pinned: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  updatedAt: '2026-11-09T12:00:00.000Z',
  updatedByName: 'Ana (demo)',
  canEdit: true,
  attachments: [{ id: IMG, name: 'bancada.png', mime: 'image/png', size: 2048, image: true }],
};

function mockApi(me: object = ME, list: object = LIST) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      let out: unknown;
      if (url.endsWith('/auth/me')) out = me;
      else if (url.includes('/panel/wiki/articles/') && method === 'GET') out = ARTICLE;
      else if (url.includes('/panel/wiki/articles')) out = { id: ART };
      else if (url.includes('/panel/wiki')) out = list;
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

describe('Premium: Wiki', () => {
  it('lista artigos com categoria, fixado e busca', async () => {
    const calls = mockApi();
    window.location.hash = '/wiki';
    const user = userEvent.setup();
    render(<App />);
    const item = await screen.findByRole('link', { name: /Higiene das pinças/ });
    expect(item).toHaveTextContent('Fixado');
    expect(item).toHaveTextContent('Procedimentos · Atualizado por Ana (demo)');
    expect(screen.getByText('Anexos: 2 KB de 100,0 MB usados.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar na Wiki'), 'pin');
    expect(calls.some((c) => c.url.includes('q=pin'))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Procedimentos (1)' }));
    expect(calls.some((c) => c.url.includes(`categoryId=${CAT}`))).toBe(true);
  });

  it('artigo aparece formatado, sem HTML do texto, com a imagem anexada', async () => {
    mockApi();
    window.location.hash = `/wiki/${ART}`;
    render(<App />);
    const article = await screen.findByRole('article', { name: 'Higiene das pinças' });
    expect(
      within(article).getByRole('heading', { name: 'Depois de cada cliente' }),
    ).toBeInTheDocument();
    expect(within(article).getByText('pinças', { selector: 'strong' })).toBeInTheDocument();
    expect(article.querySelector('script')).toBeNull();
    expect(within(article).getByText(/<script>/)).toBeInTheDocument();
    expect(within(article).getByRole('img', { name: 'Bancada' })).toHaveAttribute(
      'src',
      `/api/panel/wiki/attachments/${IMG}`,
    );
    expect(within(article).getByRole('button', { name: /Editar/ })).toBeInTheDocument();
  });

  it('escreve um artigo novo com a barra de formatação', async () => {
    const calls = mockApi();
    window.location.hash = '/wiki/novo';
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Título'), 'Abrir o estúdio');
    await user.selectOptions(screen.getByLabelText('Categoria'), CAT);
    await user.click(screen.getByRole('button', { name: 'Título de seção' }));
    await user.click(screen.getByRole('button', { name: 'Ver como fica' }));
    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar artigo' }));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Abrir o estúdio',
      body: '## Título',
      categoryId: CAT,
      pinned: false,
    });
  });

  it('quem só lê não vê os botões de escrever', async () => {
    mockApi({ ...ME, role: 'STAFF' }, { ...LIST, canEdit: false });
    window.location.hash = '/wiki';
    render(<App />);
    await screen.findByRole('link', { name: /Higiene das pinças/ });
    expect(screen.queryByRole('button', { name: /Novo artigo/ })).toBeNull();
    expect(screen.queryByText(/Anexos:/)).toBeNull();
  });
});
