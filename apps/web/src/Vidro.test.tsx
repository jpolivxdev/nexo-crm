import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  _forgetGlass,
  applyGlass,
  GLASS_DEFAULT,
  GLASS_PRESETS,
  matchPreset,
  normalizeGlass,
  readGlass,
} from './lib/glass';

const OWNER = {
  name: 'Ana (demo)',
  role: 'OWNER',
  csrfToken: 'csrf-teste',
  mustChangePassword: false,
  businessName: 'Estúdio Exemplo (demo)',
  onboardingPending: false,
  acting: null,
};

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      let body: unknown = {};
      let status = 200;
      if (url.endsWith('/auth/me')) body = OWNER;
      else if (url.endsWith('/auth/profile'))
        body = { name: 'Ana', email: 'ana@exemplo.test', twoFactor: false, otherSessions: 0 };
      else status = 404;
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  _forgetGlass();
  applyGlass();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
  localStorage.clear();
  _forgetGlass();
});

describe('efeito de vidro (regras)', () => {
  it('começa ligado no modelo fosco', () => {
    expect(readGlass()).toEqual(GLASS_DEFAULT);
    expect(matchPreset(readGlass())).toBe('fosco');
    expect(document.documentElement.dataset.vidro).toBe('on');
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe('22px');
  });

  it('não deixa a cobertura cair a ponto de o texto perder contraste', () => {
    const s = normalizeGlass({ opacity: 0.1, blur: 999, saturation: Number.NaN, edge: -3 });
    expect(s.opacity).toBe(0.25);
    expect(s.blur).toBe(32);
    expect(s.saturation).toBe(GLASS_DEFAULT.saturation);
    expect(s.edge).toBe(0);
  });

  it('valor estragado no aparelho volta ao padrão', () => {
    localStorage.setItem('nexo-vidro-v2', '{não é json');
    _forgetGlass();
    expect(readGlass()).toEqual(GLASS_DEFAULT);
  });
});

describe('efeito de vidro em Conta → Aparência', () => {
  it('a dona troca o modelo, ajusta à mão e desliga; fica guardado no aparelho', async () => {
    mockApi();
    window.location.hash = '#/conta';
    render(<App />);
    const toggle = await screen.findByRole('switch', { name: 'Efeito de vidro' });
    expect(toggle).toBeChecked();
    expect(screen.getByRole('button', { name: 'Fosco' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Sólido' }));
    expect(screen.getByRole('button', { name: 'Sólido' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe(
      `${GLASS_PRESETS.solido.blur}px`,
    );

    await userEvent.click(screen.getByText('Ajustar à mão'));
    fireEvent.change(screen.getByLabelText('Desfoque'), { target: { value: '5' } });
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe('5px');
    // ajustou à mão: nenhum modelo fica marcado
    expect(screen.getByRole('button', { name: 'Sólido' })).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(localStorage.getItem('nexo-vidro-v2') ?? '{}').blur).toBe(5);

    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }));
    expect(screen.getByRole('button', { name: 'Fosco' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(document.documentElement.dataset.vidro).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Sólido' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('nexo-vidro-v2') ?? '{}').on).toBe(false);
  });
});

describe('botão "Ajustar vidro" na barra de cima', () => {
  it('abre a janela com os controles, ajusta na hora e fecha com Esc', async () => {
    mockApi();
    window.location.hash = '#/hoje';
    render(<App />);
    const button = await screen.findByRole('button', { name: 'Ajustar vidro' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    const panel = screen.getByRole('complementary', { name: 'Aparência do vidro' });
    expect(panel).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Transparente' }));
    expect(document.documentElement.style.getPropertyValue('--vidro-opacidade')).toBe(
      String(GLASS_PRESETS.transparente.opacity),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Aparência do vidro' })).toBeNull();
    expect(button).toHaveFocus();
  });
});
