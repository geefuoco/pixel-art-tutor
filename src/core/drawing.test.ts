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

  it('can be any size from 1x1 up to 64x64, not necessarily square', () => {
    const wide = createDrawing({ width: 64, height: 3, palette });
    expect([wide.width, wide.height]).toEqual([64, 3]);
    expect(getPixel(wide, 63, 2)).toBe(TRANSPARENT);
    expect(allPixels(createDrawing({ width: 1, height: 1, palette }))).toEqual([TRANSPARENT]);
    for (const [width, height] of [
      [65, 16],
      [16, 65],
      [0, 8],
      [8, -1],
      [7.5, 8],
      [Number.NaN, 8],
    ]) {
      expect(() => createDrawing({ width: width!, height: height!, palette })).toThrow(RangeError);
    }
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

  it('fill paints the 4-connected region of the clicked color and stops at other colors', () => {
    // A ring of color 0 in a 5x5 canvas; its inside and outside are both transparent.
    // . . . . .
    // . 0 0 0 .
    // . 0 . 0 .
    // . 0 0 0 .
    // . . . . .
    let d = createDrawing({ width: 5, height: 5, palette });
    d = applyCommand(d, {
      type: 'pencil',
      color: 0,
      points: [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
        { x: 1, y: 1 },
      ],
    });
    const inside = applyCommand(d, { type: 'fill', color: 2, at: { x: 2, y: 2 } });
    const T = TRANSPARENT;
    // prettier-ignore
    expect(allPixels(inside)).toEqual([
      T, T, T, T, T,
      T, 0, 0, 0, T,
      T, 0, 2, 0, T,
      T, 0, 0, 0, T,
      T, T, T, T, T,
    ]);

    // The outside wraps around the ring without getting in.
    const outside = applyCommand(d, { type: 'fill', color: 1, at: { x: 0, y: 0 } });
    // prettier-ignore
    expect(allPixels(outside)).toEqual([
      1, 1, 1, 1, 1,
      1, 0, 0, 0, 1,
      1, 0, T, 0, 1,
      1, 0, 0, 0, 1,
      1, 1, 1, 1, 1,
    ]);
  });

  it('fill does not leak through a diagonal gap', () => {
    // 0 .
    // . 0   filling the top-right corner must not reach the bottom-left one.
    let d = createDrawing({ width: 2, height: 2, palette });
    d = applyCommand(d, { type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    d = applyCommand(d, { type: 'pencil', color: 0, points: [{ x: 1, y: 1 }] });
    d = applyCommand(d, { type: 'fill', color: 2, at: { x: 1, y: 0 } });
    expect(allPixels(d)).toEqual([0, 2, TRANSPARENT, 0]);
  });

  it('fill recolors a whole same-colored shape, and outside the canvas does nothing', () => {
    let d = createDrawing({ width: 3, height: 1, palette });
    d = applyCommand(d, {
      type: 'pencil',
      color: 0,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    d = applyCommand(d, { type: 'fill', color: 1, at: { x: 0, y: 0 } });
    expect(allPixels(d)).toEqual([1, 1, TRANSPARENT]);
    expect(allPixels(applyCommand(d, { type: 'fill', color: 2, at: { x: 5, y: 0 } }))).toEqual([
      1,
      1,
      TRANSPARENT,
    ]);
    expect(() => applyCommand(d, { type: 'fill', color: 9, at: { x: 0, y: 0 } })).toThrow(
      RangeError,
    );
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
