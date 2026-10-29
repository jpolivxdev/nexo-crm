import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem "globals" no Vitest, a limpeza automática do Testing Library não roda sozinha.
afterEach(cleanup);

// jsdom não desenha em canvas: o fundo animado do login simplesmente não liga nos testes.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
