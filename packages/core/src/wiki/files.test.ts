import { describe, expect, it } from 'vitest';
import { checkWikiFile, WIKI_FILE_MAX_BYTES } from './files.js';

/** Texto em bytes (só ASCII e Latin-1 nos testes; o pacote não tipa TextEncoder). */
const bytes = (text: string) =>
  new Uint8Array([...unescape(encodeURIComponent(text))].map((c) => c.charCodeAt(0)));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pdf = bytes('%PDF-1.7 conteúdo');
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);

describe('anexos da Wiki', () => {
  it('aceita pelo nome e confere pelo conteúdo', () => {
    expect(checkWikiFile('bancada.PNG', png)).toEqual({
      ok: true,
      type: 'image/png',
      name: 'bancada.PNG',
      image: true,
    });
    expect(checkWikiFile('termo.pdf', pdf)).toMatchObject({ ok: true, image: false });
    expect(checkWikiFile('lista.docx', zip)).toMatchObject({ ok: true });
    expect(checkWikiFile('passo a passo.txt', bytes('Olá'))).toMatchObject({
      ok: true,
      type: 'text/plain',
    });
  });

  it('recusa tipo de fora, conteúdo trocado, vazio e grande demais', () => {
    expect(checkWikiFile('logo.svg', bytes('<svg/>')).ok).toBe(false);
    expect(checkWikiFile('pagina.html', bytes('<p>')).ok).toBe(false);
    expect(checkWikiFile('foto.png', pdf)).toEqual({
      ok: false,
      error: 'O conteúdo do arquivo não bate com o tipo do nome.',
    });
    expect(checkWikiFile('nota.txt', png).ok).toBe(false);
    expect(checkWikiFile('nota.txt', new Uint8Array([0x4f, 0xc3, 0x28])).ok).toBe(false);
    expect(checkWikiFile('a.pdf', new Uint8Array()).ok).toBe(false);
    expect(checkWikiFile('a.pdf', new Uint8Array(WIKI_FILE_MAX_BYTES + 1)).ok).toBe(false);
  });

  it('limpa barras e caracteres de controle do nome', () => {
    expect(checkWikiFile('../../x\u0000.png', png)).toMatchObject({
      ok: true,
      name: '.._.._x.png',
    });
  });
});
