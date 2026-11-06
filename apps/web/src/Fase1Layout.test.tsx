import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Nex } from './components/Nex';
import { Tour } from './components/Tour';
import { markTourSeen, TOURS, tourFor, tourSeen } from './lib/tours';

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

const STEPS = [
  { title: 'Primeiro', text: 'Texto um.' },
  { target: '#alvo', title: 'Segundo', text: 'Texto dois.' },
  { target: '#nao-existe', title: 'Terceiro', text: 'Texto três.' },
];

describe('Tour guiado', () => {
  it('anda, volta, conclui e mostra a contagem de passos', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Tour steps={STEPS} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Primeiro' });
    expect(within(dialog).getByText('Passo 1 de 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Próximo' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('dialog', { name: 'Segundo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('dialog', { name: 'Primeiro' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    // Alvo que não existe na tela: o passo aparece no meio, sem quebrar.
    expect(screen.getByRole('dialog', { name: 'Terceiro' })).toHaveClass('tour__card--center');
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha com Esc e com "Pular tour"', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Tour steps={STEPS} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<Tour steps={STEPS} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Pular tour' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lembra no aparelho que o tour já foi visto', () => {
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(tourSeen()).toBe(true);
  });

  it('cada tela principal tem tour próprio e as outras caem no geral', () => {
    for (const section of ['/hoje', '/agenda', '/clientes', '/etapas', '/resultados']) {
      expect(TOURS[section]!.length).toBeGreaterThan(1);
    }
    expect(tourFor('/conta')).toBe(TOURS['/hoje']);
  });
});

describe('Nex, guia de uso', () => {
  it('abre os atalhos e cada um chama o tour da tela certa', async () => {
    const onTour = vi.fn();
    const user = userEvent.setup();
    render(<Nex topics={[{ label: 'Como marcar um horário', to: '/agenda' }]} onTour={onTour} />);
    const button = screen.getByRole('button', { name: 'Nex, guia de uso' });
    await user.click(button);
    const panel = screen.getByRole('dialog', { name: 'Nex, guia de uso' });
    expect(within(panel).getByText(/Não vê os dados das suas clientes/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Como marcar um horário' }));
    expect(onTour).toHaveBeenLastCalledWith('/agenda');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(button);
    await user.click(screen.getByRole('button', { name: /Me mostra esta tela/ }));
    expect(onTour).toHaveBeenLastCalledWith(undefined);
  });

  it('fecha com Esc e devolve o foco ao botão', async () => {
    const user = userEvent.setup();
    render(<Nex topics={[]} onTour={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Nex, guia de uso' });
    await user.click(button);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });
});
