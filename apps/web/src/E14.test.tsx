import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { periodLabel } from './screens/TimeOff';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};
const TZ = 'America/Sao_Paulo';

function mockApi(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
      .replace(/^\/api/, '')
      .split('?')[0]!;
    const key = `${init?.method ?? 'GET'} ${path}`;
    const body = path === '/auth/me' ? OWNER : (routes[key]?.(init) ?? {});
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

describe('folgas e bloqueios (E14)', () => {
  it('escreve o período do jeito que a dona fala', () => {
    expect(
      periodLabel({ startsAt: '2031-01-15T03:00:00Z', endsAt: '2031-01-16T03:00:00Z' }, TZ),
    ).toBe('15/01, dia todo');
    expect(
      periodLabel({ startsAt: '2031-01-15T03:00:00Z', endsAt: '2031-01-21T03:00:00Z' }, TZ),
    ).toBe('15/01 a 20/01, dia todo');
    expect(
      periodLabel({ startsAt: '2031-01-15T12:00:00Z', endsAt: '2031-01-15T15:00:00Z' }, TZ),
    ).toBe('15/01, das 09:00 às 12:00');
  });

  it('marca um bloqueio de horas e avisa dos horários que já estavam no período', async () => {
    let items: unknown[] = [];
    const fetchMock = mockApi({
      'GET /panel/time-off': () => ({ timeZone: TZ, items, professionals: [] }),
      'POST /panel/time-off': () => {
        items = [
          {
            id: 'b1',
            startsAt: '2031-01-15T12:00:00Z',
            endsAt: '2031-01-15T15:00:00Z',
            reason: 'Consulta',
            professional: null,
          },
        ];
        return {
          timeOff: items[0],
          conflicts: [
            {
              id: 'a1',
              startsAt: '2031-01-15T13:00:00Z',
              service: { name: 'Fio a fio (demo)' },
              contact: { id: 'c1', name: 'Cliente Exemplo 1 (demo)', phone: '5500900000001' },
            },
          ],
        };
      },
    });
    window.location.hash = '#/folgas';
    render(<App />);

    expect(await screen.findByText('Nenhuma folga marcada')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Dia todo'));
    const day = screen.getByLabelText('Dia');
    await userEvent.clear(day);
    await userEvent.type(day, '2031-01-15');
    await userEvent.type(screen.getByLabelText(/^Motivo/), 'Consulta');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar esse período' }));

    const alert = await screen.findByText(/Já existe 1 horário marcado/);
    expect(within(alert.closest('section')!).getByText('Cliente Exemplo 1 (demo)')).toBeVisible();
    expect(await screen.findByText('15/01, das 09:00 às 12:00')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      startDate: '2031-01-15',
      endDate: '2031-01-15',
      startTime: '09:00',
      endTime: '12:00',
      professionalId: null,
      reason: 'Consulta',
    });
  });
});
