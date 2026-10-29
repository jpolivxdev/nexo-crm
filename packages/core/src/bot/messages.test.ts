import { describe, expect, it } from 'vitest';
import { checkMessageOverrides, messageVariables, render } from './messages.js';

describe('mensagens editáveis pela dona', () => {
  it('lista as variáveis que cada mensagem aceita', () => {
    expect(messageVariables('confirm')).toEqual(['servico', 'data', 'hora']);
    expect(messageVariables('menu')).toEqual([]);
  });

  it('guarda só o que mudou: vazio e igual ao padrão voltam ao padrão', () => {
    const res = checkMessageOverrides({
      menu: '  O que você precisa hoje?  ',
      chooseService: '',
      notUnderstood: 'Não entendi. Escolha uma das opções abaixo.',
    });
    expect(res).toEqual({ ok: true, overrides: { menu: 'O que você precisa hoje?' } });
    if (res.ok) expect(render('menu', {}, res.overrides)).toBe('O que você precisa hoje?');
  });

  it('recusa variável que a mensagem não tem', () => {
    const res = checkMessageOverrides({ booked: 'Marcado com {dona} para {data}!' });
    expect(res).toMatchObject({ ok: false, key: 'booked' });
    if (!res.ok) expect(res.message).toContain('{servico}, {data}, {hora}');
    expect(checkMessageOverrides({ menu: 'Oi {negocio}' })).toMatchObject({
      ok: false,
      message: 'Esta mensagem não aceita palavras entre chaves.',
    });
  });

  it('botão tem no máximo 20 caracteres', () => {
    expect(checkMessageOverrides({ menuBook: 'Quero marcar um horário agora' })).toMatchObject({
      ok: false,
      key: 'menuBook',
    });
    expect(checkMessageOverrides({ menuBook: 'Agendar' })).toEqual({
      ok: true,
      overrides: { menuBook: 'Agendar' },
    });
  });

  it('o aviso inicial precisa continuar explicando como parar', () => {
    expect(checkMessageOverrides({ privacyNotice: 'Oi! Bem-vinda ao {negocio}.' })).toMatchObject({
      ok: false,
      key: 'privacyNotice',
    });
    expect(
      checkMessageOverrides({
        privacyNotice: 'Oi! Aqui é o {negocio}. Escreva "parar" para sair.',
      }),
    ).toMatchObject({ ok: true });
  });

  it('recusa chave desconhecida', () => {
    expect(checkMessageOverrides({ inventada: 'x' })).toMatchObject({ ok: false });
  });
});
