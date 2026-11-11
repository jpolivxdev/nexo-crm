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
  it('começa ligado no modelo suave', () => {
    expect(readGlass()).toEqual(GLASS_DEFAULT);
    expect(matchPreset(readGlass())).toBe('suave');
    expect(document.documentElement.dataset.vidro).toBe('on');
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe('12px');
  });

  it('não deixa a cobertura cair a ponto de o texto perder contraste', () => {
    const s = normalizeGlass({ opacity: 0.1, blur: 999, saturation: Number.NaN, edge: -3 });
    expect(s.opacity).toBe(0.55);
    expect(s.blur).toBe(32);
    expect(s.saturation).toBe(GLASS_DEFAULT.saturation);
    expect(s.edge).toBe(0);
  });

  it('valor estragado no aparelho volta ao padrão', () => {
    localStorage.setItem('nexo-vidro', '{não é json');
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
    expect(screen.getByRole('button', { name: 'Suave' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Forte' }));
    expect(screen.getByRole('button', { name: 'Forte' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe(
      `${GLASS_PRESETS.forte.blur}px`,
    );

    await userEvent.click(screen.getByText('Ajustar à mão'));
    fireEvent.change(screen.getByLabelText('Desfoque'), { target: { value: '5' } });
    expect(document.documentElement.style.getPropertyValue('--vidro-desfoque')).toBe('5px');
    // ajustou à mão: nenhum modelo fica marcado
    expect(screen.getByRole('button', { name: 'Forte' })).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(localStorage.getItem('nexo-vidro') ?? '{}').blur).toBe(5);

    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }));
    expect(screen.getByRole('button', { name: 'Suave' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(document.documentElement.dataset.vidro).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Forte' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('nexo-vidro') ?? '{}').on).toBe(false);
  });
});
