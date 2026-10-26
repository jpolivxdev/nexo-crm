import { describe, expect, it } from 'vitest';
import { maskPhone } from './mask-phone.js';

describe('maskPhone', () => {
  it('mascara celular brasileiro com 9 dígitos', () => {
    expect(maskPhone('5515991232709')).toBe('+55 15 9****-2709');
  });

  it('mascara fixo brasileiro com 8 dígitos', () => {
    expect(maskPhone('551532212709')).toBe('+55 15 3***-2709');
  });

  it('ignora formatação na entrada', () => {
    expect(maskPhone('+55 (15) 99123-2709')).toBe('+55 15 9****-2709');
  });

  it('mascara números de outros países mantendo só os 4 últimos', () => {
    expect(maskPhone('14155552671')).toBe('*******2671');
  });

  it('não revela nada quando o número é curto ou vazio', () => {
    expect(maskPhone('1234')).toBe('****');
    expect(maskPhone('')).toBe('****');
    expect(maskPhone(undefined)).toBe('****');
  });
});
