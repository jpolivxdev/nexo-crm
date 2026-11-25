import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { installLiquid } from './lib/liquid';

let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = '';
});

function Tabs() {
  const [on, setOn] = useState('Mês');
  return (
    <div className="segmented" role="group" aria-label="Ver">
      {['Mês', 'Dia', 'Semana'].map((t) => (
        <button
          key={t}
          type="button"
          className={on === t ? 'on' : ''}
          aria-pressed={on === t}
          onClick={() => setOn(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const frame = () =>
  act(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => r());
      }),
  );

describe('botões de gota', () => {
  it('prende uma gota no grupo de abas, sem mudar os botões', async () => {
    render(<Tabs />);
    stop = installLiquid();
    await frame();
    const group = screen.getByRole('group', { name: 'Ver' });
    expect(group).toHaveClass('has-liquid');
    const drops = group.querySelectorAll('.liquid-drop');
    expect(drops).toHaveLength(1);
    expect(drops[0]).toHaveAttribute('aria-hidden', 'true');
    // os botões continuam os mesmos, na mesma ordem
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Mês',
      'Dia',
      'Semana',
    ]);
  });

  it('segue a opção escolhida e solta uma onda no toque', async () => {
    render(<Tabs />);
    stop = installLiquid();
    await frame();
    const dia = screen.getByRole('button', { name: 'Dia' });
    fireEvent.pointerDown(dia, { button: 0, clientX: 5, clientY: 5 });
    expect(dia.querySelector('.liquid-ripple')).not.toBeNull();
    fireEvent.click(dia);
    await frame();
    expect(dia).toHaveAttribute('aria-pressed', 'true');
    // continua uma gota só, mesmo depois de o React redesenhar o grupo
    expect(document.querySelectorAll('.liquid-drop')).toHaveLength(1);
  });

  it('desliga e limpa tudo', async () => {
    render(<Tabs />);
    stop = installLiquid();
    await frame();
    stop();
    stop = null;
    expect(document.querySelector('.liquid-drop')).toBeNull();
    expect(screen.getByRole('group', { name: 'Ver' })).not.toHaveClass('has-liquid');
  });
});
