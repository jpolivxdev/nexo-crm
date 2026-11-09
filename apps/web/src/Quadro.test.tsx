import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const B = '88888888-8888-4888-8888-888888888888';

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
  features: ['report', 'agenda', 'bot', 'reminders', 'team_roles', 'whiteboard'],
  access: ['reports', 'settings', 'privacy'],
  twoFactor: false,
};

const RECT = {
  id: 'r1',
  type: 'rect',
  x: 0,
  y: 0,
  w: 100,
  h: 60,
  color: '#6A1FE8',
  width: 2,
  fill: false,
};

function mockApi(conflict = false) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      let out: unknown;
      let status = 200;
      if (url.endsWith('/auth/me')) out = ME;
      else if (url.endsWith('/panel/boards') && method === 'GET')
        out = {
          boards: [
            {
              id: B,
              title: 'Fluxo do atendimento',
              updatedAt: '2026-11-09T12:00:00.000Z',
              updatedByName: 'Ana (demo)',
              count: 1,
              preview: [RECT],
              canArchive: true,
            },
          ],
        };
      else if (url.endsWith(`/panel/boards/${B}`) && method === 'GET')
        out = {
          id: B,
          title: 'Fluxo do atendimento',
          elements: [],
          version: 3,
          updatedAt: '2026-11-09T12:00:00.000Z',
          updatedByName: 'Ana (demo)',
          canArchive: true,
        };
      else if (url.endsWith(`/panel/boards/${B}`) && method === 'PUT') {
        if (conflict) {
          status = 409;
          out = { message: 'Outra pessoa mudou este quadro.' };
        } else out = { version: 4 };
      } else if (url.includes('/support/unread')) out = { count: 0 };
      return new Response(JSON.stringify(out ?? {}), {
        status: out === undefined ? 404 : status,
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

describe('Premium: quadro branco', () => {
  it('lista os quadros com miniatura', async () => {
    mockApi();
    window.location.hash = '/quadros';
    render(<App />);
    const card = await screen.findByRole('link', { name: /Fluxo do atendimento/ });
    expect(card).toHaveTextContent('1 item');
    expect(card.querySelector('svg rect')).not.toBeNull();
  });

  it('desenha um retângulo e salva sozinho com a versão', async () => {
    const calls = mockApi();
    window.location.hash = `/quadros/${B}`;
    const user = userEvent.setup();
    render(<App />);
    const canvas = await screen.findByRole('img', { name: /Quadro Fluxo do atendimento: 0 itens/ });
    await user.click(screen.getByRole('button', { name: 'Retângulo' }));
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 180, pointerId: 1 });
    expect(canvas).toHaveAccessibleName(/1 item/);
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true), {
      timeout: 3000,
    });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toMatchObject({
      version: 3,
      elements: [{ type: 'rect', x: 100, y: 100, w: 100, h: 80, color: '#6A1FE8' }],
    });
    expect(await screen.findByText('Salvo')).toBeInTheDocument();

    // Desfazer tira o retângulo.
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(canvas).toHaveAccessibleName(/0 itens/);
  });

  it('avisa quando outra pessoa salvou antes', async () => {
    mockApi(true);
    window.location.hash = `/quadros/${B}`;
    const user = userEvent.setup();
    render(<App />);
    const canvas = await screen.findByRole('img', { name: /Quadro Fluxo/ });
    await user.click(screen.getByRole('button', { name: 'Círculo' }));
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    const alert = await screen.findByText(/Outra pessoa mudou este quadro enquanto/, undefined, {
      timeout: 3000,
    });
    expect(within(alert).getByRole('button', { name: 'Abrir a versão nova' })).toBeInTheDocument();
  });
});
