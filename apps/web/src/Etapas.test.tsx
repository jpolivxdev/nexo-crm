import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { nextLabel, sinceLabel } from './screens/Pipeline';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};
const contact = { id: 'c1', name: 'Cliente Exemplo 1 (demo)', phone: '5500900000001' };
const stage = (id: string, name: string, key: string, kind = 'OPEN', deals: object[] = []) => ({
  id,
  name,
  key,
  kind,
  deals,
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('quadro de etapas', () => {
  it('escreve o tempo na etapa e o próximo horário no fuso do negócio', () => {
    const now = new Date('2031-01-15T12:00:00Z');
    expect(sinceLabel('2031-01-15T08:00:00Z', now)).toBe('Aqui desde hoje');
    expect(sinceLabel('2031-01-14T08:00:00Z', now)).toBe('Aqui há 1 dia');
    expect(sinceLabel('2031-01-10T08:00:00Z', now)).toBe('Aqui há 5 dias');
    expect(nextLabel('2031-01-16T17:00:00Z', 'America/Sao_Paulo')).toBe('qui 16/01, 14:00');
  });

  it('uma coluna por etapa, "Não seguiu" no fim, e avança com um toque', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api/, '');
      const body =
        path === '/auth/me'
          ? OWNER
          : path === '/panel/pipeline'
            ? {
                id: 'p1',
                name: 'Funil',
                timeZone: 'America/Sao_Paulo',
                stages: [
                  stage('s1', 'Novo contato', 'new', 'OPEN', [
                    { id: 'd1', since: new Date().toISOString(), nextAt: null, contact },
                  ]),
                  stage('s2', 'Pediu informação', 'asked_info'),
                  stage('s3', 'Não seguiu', 'lost', 'LOST'),
                ],
              }
            : {};
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/etapas';
    render(<App />);

    expect(await screen.findByText('Cliente Exemplo 1 (demo)')).toBeInTheDocument();
    expect(screen.getByText('Quem pedir preço ou informação aparece aqui.')).toBeInTheDocument();
    const exit = screen.getByRole('region', { name: /Não seguiu/ });
    expect(exit).toHaveClass('column--exit');
    expect(within(exit).getByText('Quem faltou ou desistiu aparece aqui.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Avançar Cliente Exemplo 1 (demo) para Pediu informação',
      }),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toContain('/panel/deals/d1/stage');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ stageId: 's2' });

    await userEvent.click(screen.getByRole('button', { name: 'Mover Cliente Exemplo 1 (demo)' }));
    expect(screen.getByRole('button', { name: 'Mover para Não seguiu' })).toBeVisible();
  });

  it('soma o valor por coluna, busca por nome e muda de etapa pela lista', async () => {
    localStorage.clear();
    const other = { id: 'c2', name: 'Outra Cliente (demo)', phone: '5500900000002' };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api/, '');
      const body =
        path === '/auth/me'
          ? OWNER
          : path === '/panel/pipeline'
            ? {
                id: 'p1',
                name: 'Funil',
                timeZone: 'America/Sao_Paulo',
                stages: [
                  stage('s1', 'Agendou', 'scheduled', 'OPEN', [
                    {
                      id: 'd1',
                      since: new Date().toISOString(),
                      nextAt: '2031-01-16T17:00:00Z',
                      nextService: 'Star Clássica (demo)',
                      valueCents: 16000,
                      contact,
                    },
                    {
                      id: 'd2',
                      since: new Date().toISOString(),
                      nextAt: '2031-01-17T17:00:00Z',
                      nextService: 'Design de sobrancelha (demo)',
                      valueCents: 5000,
                      contact: other,
                    },
                  ]),
                  stage('s2', 'Atendido', 'attended'),
                ],
              }
            : {};
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/etapas';
    const user = userEvent.setup();
    render(<App />);

    const column = await screen.findByRole('region', { name: /Agendou/ });
    expect(within(column).getByText(/R\$\s?210,00/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar cliente no quadro'), 'outra');
    expect(screen.queryByText('Cliente Exemplo 1 (demo)')).toBeNull();
    expect(screen.getByText('Outra Cliente (demo)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Lista/ }));
    const select = screen.getByLabelText('Etapa de Outra Cliente (demo)');
    await user.selectOptions(select, 's2');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toContain('/panel/deals/d2/stage');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ stageId: 's2' });
  });
});
