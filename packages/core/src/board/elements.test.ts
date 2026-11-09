import { describe, expect, it } from 'vitest';
import {
  boardBounds,
  checkBoard,
  hitTest,
  moveElement,
  penElement,
  topAt,
  type BoardElement,
} from './elements.js';

const FILE = '0f8e1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const rect: BoardElement = {
  id: 'r1',
  type: 'rect',
  x: 10,
  y: 10,
  w: 100,
  h: 50,
  color: '#6A1FE8',
  width: 2,
  fill: false,
};
const arrow: BoardElement = {
  id: 'a1',
  type: 'arrow',
  x: 200,
  y: 0,
  w: -100,
  h: 100,
  color: '#100C24',
  width: 4,
};

describe('quadro branco', () => {
  it('aceita os tipos conhecidos e limpa campos estranhos', () => {
    const res = checkBoard([
      { ...rect, extra: '<script>' },
      arrow,
      {
        id: 't1',
        type: 'text',
        x: 0,
        y: 0,
        w: 80,
        h: 30,
        color: '#2F5BFF',
        text: 'Ideia',
        size: 99,
      },
      {
        id: 'p1',
        type: 'pen',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        color: '#16A34A',
        width: 8,
        points: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        id: 'i1',
        type: 'image',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        color: '#100C24',
        fileId: FILE.toUpperCase(),
      },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.elements[0]).toEqual(rect);
    expect(res.elements[2]).toMatchObject({ size: 24 });
    expect(res.fileIds).toEqual([FILE]);
  });

  it('recusa cor fora da paleta, id repetido, tipo desconhecido e números absurdos', () => {
    expect(checkBoard([{ ...rect, color: '#ff0000' }])).toEqual({
      ok: false,
      error: 'Cor fora da paleta.',
    });
    expect(checkBoard([rect, rect]).ok).toBe(false);
    expect(checkBoard([{ ...rect, type: 'html' }]).ok).toBe(false);
    expect(checkBoard([{ ...rect, x: Infinity }]).ok).toBe(false);
    expect(checkBoard([{ ...rect, x: 1e9 }]).ok).toBe(false);
    expect(checkBoard({}).ok).toBe(false);
    expect(checkBoard([{ ...rect, id: 'a b' }]).ok).toBe(false);
  });

  it('acerta o clique na borda da seta, dentro da forma e no traço', () => {
    expect(hitTest(arrow, 150, 50)).toBe(true);
    expect(hitTest(arrow, 150, 90)).toBe(false);
    expect(hitTest(rect, 60, 30)).toBe(true);
    expect(hitTest(rect, 200, 200)).toBe(false);
    const pen = penElement(
      'p',
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      '#100C24',
      2,
    );
    expect(pen).toMatchObject({ x: 0, y: 0, w: 10, h: 10 });
    expect(hitTest(pen, 10, 5)).toBe(true);
    expect(hitTest(pen, 1, 9)).toBe(false);
    expect(topAt([rect, arrow], 150, 50)?.id).toBe('a1');
    expect(topAt([arrow, rect], 60, 30)?.id).toBe('r1');
    expect(topAt([arrow, rect], 400, 400)).toBeNull();
  });

  it('move e enquadra', () => {
    const pen = penElement(
      'p',
      [
        [0, 0],
        [10, 10],
      ],
      '#100C24',
      2,
    );
    expect(moveElement(pen, 5, 5)).toMatchObject({
      x: 5,
      y: 5,
      points: [
        [5, 5],
        [15, 15],
      ],
    });
    expect(boardBounds([rect, arrow])).toEqual({ x: 10, y: 0, w: 190, h: 100 });
    expect(boardBounds([])).toBeNull();
  });
});
