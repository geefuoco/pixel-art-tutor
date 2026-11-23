import { describe, expect, it } from 'vitest';
import { TRANSPARENT, applyCommand, createDrawing, getPixel, type Drawing } from './drawing';

const palette = ['#000000', '#ffffff', '#ff0000'];

function allPixels(d: Drawing) {
  const out: number[] = [];
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) out.push(getPixel(d, x, y));
  return out;
}

describe('drawing document', () => {
  it('starts as a fully transparent grid of the requested size', () => {
    const d = createDrawing({ width: 16, height: 16, palette });
    expect(d.width).toBe(16);
    expect(d.height).toBe(16);
    expect(allPixels(d)).toHaveLength(256);
    expect(allPixels(d).every((p) => p === TRANSPARENT)).toBe(true);
  });

  it('pencil paints a pixel with the chosen palette color without changing the original', () => {
    const before = createDrawing({ width: 4, height: 4, palette });
    const after = applyCommand(before, { type: 'pencil', color: 2, points: [{ x: 1, y: 2 }] });
    expect(getPixel(after, 1, 2)).toBe(2);
    expect(allPixels(after).filter((p) => p !== TRANSPARENT)).toEqual([2]);
    expect(getPixel(before, 1, 2)).toBe(TRANSPARENT);
  });

  it('eraser makes pixels transparent again', () => {
    let d = createDrawing({ width: 4, height: 4, palette });
    d = applyCommand(d, { type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    d = applyCommand(d, { type: 'pencil', color: 1, points: [{ x: 3, y: 3 }] });
    d = applyCommand(d, { type: 'eraser', points: [{ x: 0, y: 0 }] });
    expect(getPixel(d, 0, 0)).toBe(TRANSPARENT);
    expect(getPixel(d, 3, 3)).toBe(1);
  });

  it('connects consecutive stroke points so a fast mouse drag leaves no gaps', () => {
    let d = createDrawing({ width: 8, height: 8, palette });
    d = applyCommand(d, {
      type: 'pencil',
      color: 0,
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 5, y: 2 },
      ],
    });
    const painted = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) if (getPixel(d, x, y) === 0) painted.push([x, y]);
    expect(painted).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
      [5, 2],
    ]);
  });

  it('a long shallow stroke is a 1px line with exactly one pixel per column', () => {
    let d = createDrawing({ width: 8, height: 8, palette });
    d = applyCommand(d, {
      type: 'pencil',
      color: 1,
      points: [
        { x: 0, y: 0 },
        { x: 7, y: 3 },
      ],
    });
    for (let x = 0; x < 8; x++) {
      const column = [0, 1, 2, 3, 4, 5, 6, 7].filter((y) => getPixel(d, x, y) === 1);
      expect(column).toHaveLength(1);
    }
    expect(getPixel(d, 0, 0)).toBe(1);
    expect(getPixel(d, 7, 3)).toBe(1);
  });

  it('a stroke dragged off the canvas paints only the part inside it', () => {
    let d = createDrawing({ width: 4, height: 4, palette });
    d = applyCommand(d, {
      type: 'pencil',
      color: 0,
      points: [
        { x: 2, y: 1 },
        { x: 6, y: 1 },
      ],
    });
    expect([0, 1, 2, 3].map((x) => getPixel(d, x, 1))).toEqual([TRANSPARENT, TRANSPARENT, 0, 0]);
    expect(allPixels(d).filter((p) => p !== TRANSPARENT)).toHaveLength(2);
  });

  it('rejects a pencil color that is not in the palette', () => {
    const d = createDrawing({ width: 4, height: 4, palette });
    const at = [{ x: 0, y: 0 }];
    expect(() => applyCommand(d, { type: 'pencil', color: 3, points: at })).toThrow(RangeError);
    expect(() => applyCommand(d, { type: 'pencil', color: TRANSPARENT, points: at })).toThrow(
      RangeError,
    );
  });

  it('reading a pixel outside the canvas is an error', () => {
    const d = createDrawing({ width: 4, height: 4, palette });
    expect(() => getPixel(d, 4, 0)).toThrow(RangeError);
    expect(() => getPixel(d, 0, -1)).toThrow(RangeError);
  });
});
