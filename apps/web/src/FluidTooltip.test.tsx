import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluidTooltip } from './components/FluidTooltip';
import { Sidebar } from './components/Sidebar';
import { TIP_TUNING, tipText } from './lib/fluidTooltip';
import { Home } from 'lucide-react';

const mouse = { pointerType: 'mouse' } as const;

function tip() {
  return document.getElementById('nexo-dica') as HTMLElement;
}

/** Texto que está entrando (o que sai fica com aria-hidden). */
function liveText() {
  return [...tip().querySelectorAll('.ftip__label:not([aria-hidden])')]
    .map((l) => l.textContent)
    .join('|');
}

function Fixture() {
  return (
    <>
      <div role="toolbar" aria-label="Ferramentas">
        <button type="button" className="icon-button" aria-label="Desfazer" data-tip-sub="Ctrl+Z">
          u
        </button>
        <button type="button" className="icon-button" aria-label="Refazer">
          r
        </button>
        <button type="button" data-tip="Copia o texto do modelo">
          Copiar
        </button>
        <button type="button" className="icon-button" aria-label="Sem dica" data-tip-off>
          x
        </button>
      </div>
      <p>fora</p>
      <FluidTooltip />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'performance'],
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Dica fluida', () => {
  it('lê o texto de data-tip ou do aria-label, e respeita data-tip-off', () => {
    const a = document.createElement('button');
    a.setAttribute('aria-label', 'Fechar');
    expect(tipText(a)).toEqual({ text: 'Fechar', sub: '' });
    a.setAttribute('data-tip', 'Fechar o aviso');
    a.setAttribute('data-tip-sub', 'Esc');
    expect(tipText(a)).toEqual({ text: 'Fechar o aviso', sub: 'Esc' });
    a.setAttribute('data-tip-off', '');
    expect(tipText(a)).toBeNull();
  });

  it('abre com o mouse depois de um tempo curto e desliza para o próximo botão', () => {
    render(<Fixture />);
    expect(tip()).toHaveAttribute('role', 'tooltip');
    const undo = screen.getByRole('button', { name: 'Desfazer' });
    const redo = screen.getByRole('button', { name: 'Refazer' });

    fireEvent.pointerOver(undo, mouse);
    expect(liveText()).toBe('');
    act(() => vi.advanceTimersByTime(TIP_TUNING.openDelay + 20));
    expect(liveText()).toBe('Desfazer Ctrl+Z');

    // já aberta: o próximo botão troca na hora, com o texto antigo saindo
    fireEvent.pointerOver(redo, mouse);
    expect(liveText()).toBe('Refazer');
    expect(tip().querySelectorAll('.ftip__label').length).toBe(2);
    act(() => vi.advanceTimersByTime(1500));
    expect(tip().querySelectorAll('.ftip__label').length).toBe(1);

    // saiu dos botões: fecha
    fireEvent.pointerOver(screen.getByText('fora'), mouse);
    act(() => vi.advanceTimersByTime(1500));
    expect(Number(tip().style.opacity)).toBe(0);
  });

  it('não abre no toque', () => {
    render(<Fixture />);
    fireEvent.pointerOver(screen.getByRole('button', { name: 'Refazer' }), {
      pointerType: 'touch',
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(liveText()).toBe('');
  });

  it('com data-tip-off o botão fica sem dica', () => {
    render(<Fixture />);
    fireEvent.pointerOver(screen.getByRole('button', { name: 'Sem dica' }), mouse);
    act(() => vi.advanceTimersByTime(1000));
    expect(liveText()).toBe('');
  });

  it('abre na hora pelo teclado, descreve o botão quando o texto é outro e fecha com Esc', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<Fixture />);
    const copy = screen.getByRole('button', { name: 'Copiar' });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(copy).toHaveFocus();
    expect(liveText()).toBe('Copia o texto do modelo');
    expect(copy).toHaveAccessibleDescription('Copia o texto do modelo');

    await user.keyboard('{Escape}');
    expect(copy).not.toHaveAttribute('aria-describedby');
  });

  it('não repete o nome no leitor de tela quando a dica é igual ao rótulo', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<Fixture />);
    const redo = screen.getByRole('button', { name: 'Refazer' });
    await user.tab();
    await user.tab();
    expect(redo).toHaveFocus();
    expect(liveText()).toBe('Refazer');
    expect(redo).not.toHaveAttribute('aria-describedby');
  });

  it('no menu recolhido mostra o nome e a explicação da seção', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    localStorage.setItem('nexo-menu-recolhido', '1');
    render(
      <>
        <Sidebar
          businessName="Estúdio Exemplo (demo)"
          items={[{ to: '/hoje', label: 'Hoje', Icon: Home, hint: 'O seu dia' }]}
          section="/hoje"
          onLogout={() => {}}
        />
        <FluidTooltip />
      </>,
    );
    const link = screen.getByRole('link', { name: 'Hoje' });
    expect(link).not.toHaveAttribute('title');
    await user.tab();
    expect(link).toHaveFocus();
    expect(liveText()).toBe('Hoje O seu dia');
    expect(tip().dataset.side).toBe('right');
    expect(link).toHaveAccessibleDescription('Hoje O seu dia');
  });
});
