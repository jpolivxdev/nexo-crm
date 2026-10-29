import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { gridStart, monthLabel } from './screens/Agenda';
import { localDate } from './lib/format';

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

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('agenda em calendário do mês', () => {
  it('a grade começa no domingo da semana do dia 1', () => {
    expect(gridStart('2026-10-01')).toBe('2026-09-27');
    expect(gridStart('2026-11-01')).toBe('2026-11-01');
    expect(monthLabel('2026-10-01')).toBe('outubro de 2026');
  });

  it('marca os dias com horário e mostra os horários do dia escolhido', async () => {
    const today = localDate(new Date(), TZ);
    const other = today.slice(8) === '15' ? `${today.slice(0, 8)}16` : `${today.slice(0, 8)}15`;
    const appointment = {
      id: 'a1',
      startsAt: `${other}T13:00:00Z`,
      endsAt: `${other}T14:30:00Z`,
      status: 'SCHEDULED',
      source: 'WHATSAPP',
      service: { id: 's1', name: 'Fio a fio (demo)' },
      professional: { id: 'p1', name: 'Ana (demo)' },
      contact: { id: 'c1', name: 'Cliente Exemplo 1 (demo)', phone: '5500900000001' },
    };
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url).replace(/^\/api/, '');
      const body =
        path === '/auth/me'
          ? OWNER
          : { from: today, days: 42, timeZone: TZ, appointments: [appointment] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/agenda';
    render(<App />);

    expect(await screen.findByText('Nenhum horário neste dia')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/panel/agenda'));
    expect(String(call?.[0])).toContain('days=42');

    const day = screen.getByRole('button', {
      name: new RegExp(`, ${Number(other.slice(8))}: 1 horário$`),
    });
    expect(day).toHaveClass('month__day--busy');
    await userEvent.click(day);
    expect(await screen.findByText('Cliente Exemplo 1 (demo)')).toBeInTheDocument();
  });
});
