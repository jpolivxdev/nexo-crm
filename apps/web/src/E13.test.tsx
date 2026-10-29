import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { contactName, phone } from './lib/format';
import { exportFileName } from './screens/ContactPrivacy';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

const ID = '11111111-1111-4111-8111-111111111111';
const FILE = {
  id: ID,
  name: 'Cliente Teste (demo)',
  phone: '5500900000001',
  timeZone: 'America/Sao_Paulo',
  notes: null,
  tags: [],
  optedOutAt: null,
  source: 'WHATSAPP',
  createdAt: '2031-01-01T12:00:00Z',
  deal: null,
  appointments: [],
  conversations: [],
  tasks: [],
};

function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = url.endsWith('/auth/me')
      ? OWNER
      : url.endsWith(`/panel/contacts/${ID}/export`)
        ? { contact: { name: FILE.name } }
        : url.endsWith(`/panel/contacts/${ID}/erase`) && init?.method === 'POST'
          ? { cancelledAppointments: 0, deletedMessages: 0 }
          : url.endsWith(`/panel/contacts/${ID}`)
            ? FILE
            : url.includes('/panel/contacts')
              ? []
              : {};
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

describe('dados da cliente: baixar e excluir (E13)', () => {
  it('baixa os dados num arquivo com o nome da cliente', async () => {
    const fetchMock = mockApi();
    const createUrl = vi.fn(() => 'blob:teste');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.location.hash = `#/clientes/${ID}`;
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Baixar dados' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Arquivo baixado');
    expect(click).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/export'))).toBe(true);
    click.mockRestore();
  });

  it('excluir pede confirmação, manda o confirm e volta para a lista', async () => {
    const fetchMock = mockApi();
    window.location.hash = `#/clientes/${ID}`;
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir dados' }));
    expect(
      screen.getByRole('heading', { name: 'Excluir os dados de Cliente Teste (demo)?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Não dá para desfazer.')).toBeInTheDocument();
    // Voltar não exclui nada.
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/erase'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir dados' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, excluir para sempre' }));
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/erase'));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ confirm: true });
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('cliente excluída aparece sem telefone e com nome neutro', () => {
    expect(phone(`excluida-${ID}`)).toBe('');
    expect(contactName({ name: null, phone: `excluida-${ID}` })).toBe('Cliente excluída');
    expect(exportFileName('Maria José da Silva', '2031-01-15')).toBe(
      'dados-maria-jose-da-silva-2031-01-15.json',
    );
  });
});
