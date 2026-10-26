import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O SWC é necessário para os decorators do NestJS (emitDecoratorMetadata) nos testes.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
});
