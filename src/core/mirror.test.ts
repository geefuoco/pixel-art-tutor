import { describe, expect, it } from 'vitest';
import { TRANSPARENT, applyCommand } from './drawing';
import { drawingOf as drawing, rowsOf as rows } from './test-grids';

const T = TRANSPARENT;

describe('horizontal mirror symmetry', () => {
  it('a mirrored pencil stroke is drawn again, flipped left to right', () => {
    const before = drawing([
      [T, T, T, T, T, T],
      [T, T, T, T, T, T],
    ]);
    const after = applyCommand(before, {
      type: 'pencil',
      color: 2,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      mirror: true,
    });
    // The two halves are separate strokes: nothing joins them across the middle.
    expect(rows(after)).toEqual([
      [2, T, T, T, T, 2],
      [T, 2, T, T, 2, T],
    ]);
  });

  it('on an odd width, the middle column is its own mirror image', () => {
    const before = drawing([[T, T, T]]);
    const after = applyCommand(before, {
      type: 'pencil',
      color: 0,
      points: [{ x: 1, y: 0 }],
      mirror: true,
    });
    expect(rows(after)).toEqual([[T, 0, T]]);
  });

  it('mirrors the eraser and fill too', () => {
    const before = drawing([
      [0, 0, T, 1, 1],
      [0, T, T, T, 1],
    ]);
    const erased = applyCommand(before, { type: 'eraser', points: [{ x: 0, y: 0 }], mirror: true });
    expect(rows(erased)).toEqual([
      [T, 0, T, 1, T],
      [0, T, T, T, 1],
    ]);
    // The flipped press lands in a different region, which is filled on its own.
    const filled = applyCommand(before, {
      type: 'fill',
      color: 2,
      at: { x: 0, y: 1 },
      mirror: true,
    });
    expect(rows(filled)).toEqual([
      [2, 2, T, 2, 2],
      [2, T, T, T, 2],
    ]);
  });

  it('without the option, commands draw only where they are applied', () => {
    const before = drawing([[T, T, T, T]]);
    const after = applyCommand(before, { type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    expect(rows(after)).toEqual([[1, T, T, T]]);
  });
});
