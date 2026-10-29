import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function appointment(id: string, startsAt: string, status = 'BOOKED') {
  return {
    id,
    startsAt,
    endsAt: startsAt.replace('T13:', 'T14:'),
    status,
    source: 'BOT',
    service: { id: 's1', name: 'Cílios (demo)' },
    professional: { id: 'p1', name: 'Ana (demo)' },
    contact: { id: `c-${id}`, name: `Cliente ${id} (demo)`, phone: '5515999990000' },
  };
}

function mockApi() {
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url)
      .replace(/^\/api/, '')
      .split('?')[0]!;
    const body =
      path === '/auth/me'
        ? ME
        : path === '/panel/agenda'
          ? {
              from: '2031-01-26',
              days: 42,
              timeZone: TZ,
              appointments: [
                appointment('1', '2031-02-12T13:00:00.000Z'),
                appointment('2', '2031-02-12T16:00:00.000Z'),
                appointment('3', '2031-02-20T13:00:00.000Z', 'CANCELLED'),
              ],
            }
          : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2031-02-10T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('agenda: calendário do mês', () => {
  it('abre no mês, conta os horários por dia e mostra o dia escolhido', async () => {
    const fetchMock = mockApi();
    window.location.hash = '#/agenda';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'fevereiro de 2031' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    // Busca as 6 semanas a partir do domingo da semana do dia 1.
    const agendaCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((u) => u.includes('/panel/agenda'))!;
    expect(agendaCall).toContain('from=2031-01-26');
    expect(agendaCall).toContain('days=42');

    // Cancelado não conta.
    expect(screen.getByText('2 horários no mês')).toBeInTheDocument();
    const busy = screen.getByRole('button', { name: 'quarta-feira, 12/02, 2 horários' });
    expect(screen.getByRole('button', { name: 'quinta-feira, 20/02, sem horários' })).toBeVisible();

    await userEvent.click(busy);
    expect(busy).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Cliente 1 (demo)')).toBeInTheDocument();
    expect(screen.getByText('Cliente 2 (demo)')).toBeInTheDocument();
  });
});
