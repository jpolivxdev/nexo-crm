import { describe, expect, it } from 'vitest';
import { render } from './messages.js';
import { choices } from './outgoing.js';
import { globalCommand, normalize } from './text.js';

describe('choices (limites do WhatsApp)', () => {
  it('até 3 opções curtas viram botões', () => {
    const msg = choices('Escolha', [
      { id: 'a', title: 'Marcar horário' },
      { id: 'b', title: 'Meus horários' },
    ]);
    expect(msg.type).toBe('buttons');
  });

  it('título acima de 20 caracteres ou 4 opções viram lista', () => {
    expect(choices('x', [{ id: 'a', title: 'Falar com Maria Aparecida' }]).type).toBe('list');
    expect(
      choices(
        'x',
        ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id })),
      ).type,
    ).toBe('list');
  });

  it('corta título de linha em 24 caracteres com reticências', () => {
    const msg = choices('x', [
      { id: 'a', title: 'Aplicação de cílios volume russo completo' },
      { id: 'b', title: 'b' },
      { id: 'c', title: 'c' },
      { id: 'd', title: 'd' },
    ]);
    if (msg.type !== 'list') throw new Error('esperava lista');
    expect([...msg.rows[0]!.title].length).toBe(24);
    expect(msg.rows[0]!.title.endsWith('…')).toBe(true);
  });

  it('recusa mais de 10 opções (quem chama pagina)', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, title: `${i}` }));
    expect(() => choices('x', many)).toThrow();
  });
});

describe('textos', () => {
  it('reconhece comandos com acento, maiúscula e pontuação', () => {
    expect(globalCommand('PARAR!')).toBe('opt_out');
    expect(globalCommand('Olá')).toBe('menu');
    expect(globalCommand('  Cancelar ')).toBe('cancel');
    expect(globalCommand('quero marcar')).toBeNull();
    expect(normalize('Início.')).toBe('inicio');
  });

  it('usa a mensagem do dono quando existe e o padrão quando está vazia', () => {
    expect(render('menu', {}, { menu: 'E aí, o que manda?' })).toBe('E aí, o que manda?');
    expect(render('menu', {}, { menu: '  ' })).toBe('Como posso ajudar? Escolha uma opção.');
    expect(render('menuHuman', { dona: 'Ana' })).toBe('Falar com Ana');
  });
});
