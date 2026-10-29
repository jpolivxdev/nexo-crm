import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { alertText } from './components/OwnerToasts';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

/** EventSource de mentira: guarda as conexões para o teste mandar avisos. */
class FakeEventSource {
  static all: FakeEventSource[] = [];
  private handlers: ((e: MessageEvent<string>) => void)[] = [];
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(_type: string, handler: (e: MessageEvent<string>) => void) {
    this.handlers.push(handler);
  }
  close() {
    this.closed = true;
  }
  emit(data: object) {
    for (const h of this.handlers) h({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

function mockApi(routes: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
      .replace(/^\/api/, '')
      .split('?')[0]!;
    const body =
      path === '/auth/me' ? OWNER : (routes[`${init?.method ?? 'GET'} ${path}`]?.(init) ?? {});
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
  FakeEventSource.all = [];
  window.location.hash = '';
});

describe('avisos para a dona (E20)', () => {
  it('só o que a cliente fez vira aviso, sem nome dela', () => {
    expect(alertText({ type: 'agenda.changed' })).toBeNull();
    expect(alertText({ type: 'agenda.changed', alert: 'cancelled' })?.text).toBe(
      'Uma cliente cancelou um horário pelo WhatsApp.',
    );
    expect(alertText({ type: 'handoff.requested' })?.to).toBe('/hoje');
  });

  it('aviso aparece no topo com uma conexão só e leva para a agenda', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockApi({
      'GET /panel/today': () => ({
        date: '2031-01-15',
        businessName: 'Estúdio Exemplo (demo)',
        timeZone: 'America/Sao_Paulo',
        appointments: [],
        handoffs: [],
        tasks: [],
        activity: [],
      }),
      'GET /panel/report': () => ({ daily: [] }),
    });
    window.location.hash = '#/hoje';
    render(<App />);
    expect(await screen.findByText('Seu dia de hoje')).toBeInTheDocument();
    const open = FakeEventSource.all.filter((s) => !s.closed);
    expect(open).toHaveLength(1);

    act(() => open[0]!.emit({ type: 'agenda.changed', alert: 'booked' }));
    expect(await screen.findByText('Uma cliente marcou um horário pelo WhatsApp.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(window.location.hash).toBe('#/agenda');
  });

  it('salva o e-mail e o prazo do próximo horário e avisa quando o e-mail ainda não sai', async () => {
    const fetchMock = mockApi({
      'GET /panel/setup/alerts': () => ({
        notifyEmail: false,
        nextVisitDays: 0,
        emailAvailable: false,
      }),
    });
    window.location.hash = '#/avisos';
    render(<App />);
    expect(await screen.findByText(/O envio de e-mail ainda não está ligado/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Mandar um e-mail para mim/));
    const days = screen.getByLabelText('Quantos dias depois do atendimento');
    await userEvent.clear(days);
    await userEvent.type(days, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Avisos salvos.')).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ notifyEmail: true, nextVisitDays: 10 });
  });
});
