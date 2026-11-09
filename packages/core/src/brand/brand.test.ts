import { describe, expect, it } from 'vitest';
import { checkBrandColor, contrastRatio, normalizeDomain } from './brand.js';
import { fillTemplate, templateFields, unknownFields } from './templates.js';

describe('marca do negócio', () => {
  it('cor precisa de contraste com texto branco', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(checkBrandColor('#6a1fe8')).toEqual({ ok: true, color: '#6A1FE8' });
    expect(checkBrandColor('#FFD700').ok).toBe(false);
    expect(checkBrandColor('roxo').ok).toBe(false);
  });

  it('domínio: só o endereço, sem http e sem caminho', () => {
    expect(normalizeDomain(' https://Painel.InstitutoStar.com.br/entrar ')).toEqual({
      ok: true,
      domain: 'painel.institutostar.com.br',
    });
    expect(normalizeDomain('localhost').ok).toBe(false);
    expect(normalizeDomain('10.0.0.1').ok).toBe(false);
    expect(normalizeDomain('-ruim.com').ok).toBe(false);
    expect(normalizeDomain('painel.nexo.app').ok).toBe(false);
  });
});

describe('modelos de mensagem', () => {
  it('preenche campos e marca o que falta', () => {
    expect(
      fillTemplate('Oi, {primeiro_nome}! Seu horário no {negocio} é {data} às {hora}.', {
        primeiro_nome: 'Bia',
        negocio: 'Estúdio Exemplo (demo)',
        data: '12/11',
      }),
    ).toBe('Oi, Bia! Seu horário no Estúdio Exemplo (demo) é 12/11 às ___.');
    expect(templateFields('{nome} {nome} {x}')).toEqual(['nome', 'x']);
    expect(unknownFields('Oi {nme}, {nome}')).toEqual(['nme']);
    expect(fillTemplate('{nme}', {})).toBe('{nme}');
  });
});
