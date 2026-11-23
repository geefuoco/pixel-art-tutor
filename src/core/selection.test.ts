import { describe, expect, it } from 'vitest';
import { TRANSPARENT, applyCommand, copyPixels, rectBetween, type Drawing } from './drawing';

const palette = ['#000000', '#ffffff', '#ff0000'];
const T = TRANSPARENT;

/** A drawing from rows of pixel values, top row first. */
function drawing(rows: number[][]): Drawing {
  return { width: rows[0]!.length, height: rows.length, palette, pixels: rows.flat() };
}

function rows(d: Drawing) {
  return Array.from({ length: d.height }, (_, y) => d.pixels.slice(y * d.width, (y + 1) * d.width));
}

describe('move', () => {
  it('moves the pixels in a rectangle, leaving transparency behind', () => {
    const before = drawing([
      [0, 1, T, T],
      [2, 0, T, T],
      [T, T, T, 1],
    ]);
    const after = applyCommand(before, {
      type: 'move',
      from: { x: 0, y: 0, width: 2, height: 2 },
      to: { x: 1, y: 1 },
    });
    expect(rows(after)).toEqual([
      [T, T, T, T],
      [T, 0, 1, T],
      [T, 2, 0, 1],
    ]);
  });

  it('transparent pixels in the moved rectangle let what they land on show through', () => {
    const before = drawing([
      [0, T, 1, 1],
      [T, 0, 1, 1],
    ]);
    const after = applyCommand(before, {
      type: 'move',
      from: { x: 0, y: 0, width: 2, height: 2 },
      to: { x: 2, y: 0 },
    });
    expect(rows(after)).toEqual([
      [T, T, 0, 1],
      [T, T, 1, 0],
    ]);
  });

  it('pixels moved off the canvas are lost', () => {
    const before = drawing([[0, 1, 2]]);
    const moved = applyCommand(before, {
      type: 'move',
      from: { x: 0, y: 0, width: 3, height: 1 },
      to: { x: 2, y: 0 },
    });
    expect(rows(moved)).toEqual([[T, T, 0]]);
    // Moving back does not bring them back.
    const back = applyCommand(moved, {
      type: 'move',
      from: { x: 0, y: 0, width: 3, height: 1 },
      to: { x: -2, y: 0 },
    });
    expect(rows(back)).toEqual([[0, T, T]]);
  });
});

describe('copy and paste', () => {
  it('pastes a copied rectangle at a point, leaving the original in place', () => {
    const before = drawing([
      [T, 0, 1, T, T],
      [T, 2, T, T, 1],
    ]);
    const clip = copyPixels(before, { x: 1, y: 0, width: 2, height: 2 });
    const after = applyCommand(before, { type: 'paste', clip, at: { x: 3, y: 0 } });
    expect(rows(after)).toEqual([
      [T, 0, 1, 0, 1],
      [T, 2, T, 2, 1],
    ]);
  });

  it('a copy keeps the pixels it was made from, whatever happens to the drawing later', () => {
    const before = drawing([[0, 1]]);
    const clip = copyPixels(before, { x: 0, y: 0, width: 2, height: 1 });
    const erased = applyCommand(before, {
      type: 'eraser',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    expect(rows(applyCommand(erased, { type: 'paste', clip, at: { x: 0, y: 0 } }))).toEqual([
      [0, 1],
    ]);
  });

  it('only the part of a rectangle on the canvas is copied, and pasting off the edge clips', () => {
    const before = drawing([
      [0, 1],
      [2, 0],
    ]);
    const clip = copyPixels(before, { x: 1, y: -1, width: 3, height: 2 });
    expect(clip).toMatchObject({ width: 1, height: 1 });
    const pasted = applyCommand(before, {
      type: 'paste',
      clip: copyPixels(before, { x: 0, y: 0, width: 2, height: 2 }),
      at: { x: 1, y: 1 },
    });
    expect(rows(pasted)).toEqual([
      [0, 1],
      [2, 0],
    ]);
    const shifted = applyCommand(before, {
      type: 'paste',
      clip: copyPixels(before, { x: 0, y: 0, width: 2, height: 1 }),
      at: { x: -1, y: 1 },
    });
    expect(rows(shifted)).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it('rejects a paste with colors that are not in the palette', () => {
    const d = drawing([[T, T]]);
    expect(() =>
      applyCommand(d, {
        type: 'paste',
        clip: { width: 1, height: 1, pixels: [3] },
        at: { x: 0, y: 0 },
      }),
    ).toThrow(RangeError);
  });
});

describe('selecting a rectangle', () => {
  const d = drawing([
    [T, T, T, T],
    [T, T, T, T],
    [T, T, T, T],
  ]);

  it('spans the two corner pixels of a drag, whichever way the drag went', () => {
    const expected = { x: 1, y: 0, width: 3, height: 2 };
    expect(rectBetween(d, { x: 1, y: 0 }, { x: 3, y: 1 })).toEqual(expected);
    expect(rectBetween(d, { x: 3, y: 1 }, { x: 1, y: 0 })).toEqual(expected);
    expect(rectBetween(d, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({
      x: 2,
      y: 2,
      width: 1,
      height: 1,
    });
  });

  it('stops at the edges of the canvas when the drag goes past them', () => {
    expect(rectBetween(d, { x: 2, y: 1 }, { x: 9, y: -5 })).toEqual({
      x: 2,
      y: 0,
      width: 2,
      height: 2,
    });
  });
});
