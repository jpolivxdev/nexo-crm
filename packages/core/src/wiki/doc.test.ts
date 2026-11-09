import { describe, expect, it } from 'vitest';
import { parseDoc, parseInline, plainText, snippet } from './doc.js';

const ID = '0f8e1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('texto da Wiki', () => {
  it('títulos, parágrafos, listas, destaque e imagem anexada', () => {
    const doc = parseDoc(
      [
        '## Abrir o estúdio',
        'Chegue **15 minutos** antes.',
        'Ligue o ar.',
        '',
        '- Conferir a agenda',
        '- Separar o material',
        '1. Primeiro',
        '2. Segundo',
        '> Nunca atenda sem o termo assinado.',
        `![Bancada pronta](anexo:${ID})`,
        '### Fechar',
      ].join('\n'),
    );
    expect(doc.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'image',
      'heading',
    ]);
    expect(doc[1]).toEqual({
      type: 'paragraph',
      spans: [
        { type: 'text', text: 'Chegue ' },
        { type: 'bold', text: '15 minutos' },
        { type: 'text', text: ' antes.\nLigue o ar.' },
      ],
    });
    expect(doc[2]).toMatchObject({
      ordered: false,
      items: [[{ text: 'Conferir a agenda' }], [{}]],
    });
    expect(doc[3]).toMatchObject({ ordered: true });
    expect(doc[5]).toEqual({ type: 'image', alt: 'Bancada pronta', attachmentId: ID });
    expect(doc[6]).toMatchObject({ type: 'heading', level: 3 });
  });

  it('links só seguros; o resto fica como texto', () => {
    expect(parseInline('[site](https://exemplo.test) e [x](javascript:alert(1))')).toEqual([
      { type: 'link', text: 'site', href: 'https://exemplo.test' },
      { type: 'text', text: ' e [x](javascript:alert(1))' },
    ]);
    expect(parseInline('[agenda](#/agenda) _já_ `cod`')).toEqual([
      { type: 'link', text: 'agenda', href: '#/agenda' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'já' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'cod' },
    ]);
    // HTML é só texto.
    expect(parseDoc('<script>alert(1)</script>')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: '<script>alert(1)</script>' }] },
    ]);
  });

  it('texto corrido e trecho da busca sem diferenciar acento', () => {
    const text = plainText('## Higiene\n- Lavar as **pinças** depois de cada cliente');
    expect(text).toBe('Higiene Lavar as pinças depois de cada cliente');
    expect(snippet(text, 'PINCAS', 20)).toBe('…var as pinças depois…');
    expect(snippet('curto', 'nada')).toBe('curto');
  });
});
