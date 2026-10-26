import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('mostra um estado vazio que explica o próximo passo', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Seu dia de hoje' })).toBeInTheDocument();
    expect(screen.getByText(/próximo passo é cadastrar seus serviços/)).toBeInTheDocument();
  });
});
