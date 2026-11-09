import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiError } from './lib/api';
import { leaveDemo } from './lib/demo/mode';
import { demoRequest, resetDemo } from './lib/demo/server';

beforeEach(() => {
  resetDemo();
  // Fora da demo, a API real responde "sem sessão".
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 401 })),
  );
});

afterEach(() => {
  leaveDemo();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('demonstração', () => {
  it('abre o painel com dados fictícios, faixa de demo e tour geral, sem chamar o servidor', async () => {
    window.location.hash = '/demo';
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();
    expect(screen.getByText('Demonstração')).toBeInTheDocument();
    expect(
      await screen.findByRole('dialog', { name: 'Boas-vindas à demonstração' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular tour' }));

    // Uma cliente pediu para falar com a dona: aparece no Hoje.
    expect(await screen.findAllByText('Tatiane Ramos (demo)')).not.toHaveLength(0);
    // Só a primeira leitura da sessão foi ao servidor.
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(calls.every((u) => u.endsWith('/auth/me'))).toBe(true);

    // Sair da demo volta para a página inicial.
    await user.click(screen.getByRole('button', { name: 'Sair da demonstração' }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('na demo, Plano e assinatura mostra os mesmos dois planos da página inicial', async () => {
    window.location.hash = '/demo';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Pular tour' }));
    window.location.hash = '/assinatura';
    const basico = await screen.findByRole('listitem', { name: 'Básico' });
    expect(within(basico).getByRole('button', { name: 'Plano desta demonstração' })).toBeDisabled();
    expect(screen.getByRole('listitem', { name: 'Premium' })).toBeInTheDocument();
  });

  it('as ações mudam só a memória: responder pausa o robô e marcar realizado move a etapa', async () => {
    const conv = (await demoRequest('GET', '/panel/conversations?tab=waiting')) as {
      conversations: { id: string; contact: { id: string } }[];
    };
    expect(conv.conversations.length).toBe(2);
    const id = conv.conversations[0]!.id;
    await demoRequest('POST', `/panel/conversations/${id}/messages`, {}, { text: 'Oi! Dá sim.' });
    const one = (await demoRequest('GET', `/panel/conversations/${id}`)) as {
      messages: { body: string; direction: string }[];
    };
    expect(one.messages.at(-1)).toMatchObject({ body: 'Oi! Dá sim.', direction: 'OUTBOUND' });

    const today = (await demoRequest('GET', '/panel/today')) as {
      appointments: { id: string; status: string; contact: { id: string } }[];
    };
    const open = today.appointments.find((a) => a.status !== 'DONE')!;
    await demoRequest('POST', `/panel/appointments/${open.id}/status`, {}, { status: 'DONE' });
    const pipe = (await demoRequest('GET', '/panel/pipeline')) as {
      stages: { key: string; deals: { contact: { id: string } }[] }[];
    };
    const attended = pipe.stages.find((s) => s.key === 'attended')!;
    expect(attended.deals.map((d) => d.contact.id)).toContain(open.contact.id);

    // Recomeçar apaga tudo.
    resetDemo();
    const again = (await demoRequest('GET', `/panel/conversations/${id}`)) as {
      messages: { body: string }[];
    };
    expect(again.messages.map((m) => m.body)).not.toContain('Oi! Dá sim.');
  });

  it('nada sai da demo: sem IA, sem acesso para a equipe, sem excluir dados', async () => {
    expect(await demoRequest('GET', '/panel/assistant')).toEqual({ enabled: false, left: 0 });
    const pro = (await demoRequest('GET', '/panel/team')) as { professionals: { id: string }[] };
    await expect(
      demoRequest(
        'POST',
        `/panel/team/${pro.professionals[0]!.id}/login`,
        {},
        { email: 'x@x.test' },
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      demoRequest('POST', '/panel/contacts/demo-c-1/erase', {}, { confirm: true }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(demoRequest('GET', '/panel/qualquer-coisa')).rejects.toMatchObject({
      status: 404,
    });
    const contacts = (await demoRequest('GET', '/panel/contacts')) as {
      name: string;
      phone: string;
    }[];
    expect(contacts.every((c) => c.name.endsWith('(demo)') && c.phone.startsWith('5500'))).toBe(
      true,
    );
  });

  it('a página inicial mostra os dois planos e leva para a demo', async () => {
    window.location.hash = '';
    render(<App />);
    const plans = await screen.findByRole('heading', { name: 'Planos' });
    const section = plans.closest('section')!;
    expect(within(section).getByRole('heading', { name: 'Básico' })).toBeInTheDocument();
    expect(within(section).getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(within(section).getAllByText('Valor em breve')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver a demonstração' })).toHaveAttribute(
      'href',
      '#/demo',
    );
  });
});
