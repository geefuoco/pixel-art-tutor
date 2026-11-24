import { describe, expect, it } from 'vitest';
import { findMistakes } from './mistakes';
import { BUNDLED_PALETTES } from './palettes';
import { spriteOf } from './test-grids';

const PALETTE = ['#111111', '#cc3333', '#881111', '#ff9999'];
const sprite = (rows: string[]) => spriteOf(rows, 'OBSH', PALETTE);

const RED_POTION = spriteOf(
  ['...ab...', '...cd...', '...cd...', '..cvvd..', '.ivcvyd.', '.ivvvyd.', '.iyyyyd.', '..dddd..'],
  'abcdivy',
  ['#dba463', '#bb7547', '#e3e6ff', '#849be4', '#b9bffb', '#df3e23', '#b4202a'],
);

function pointsOf(rows: string[]) {
  return rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === 'x' ? [{ x, y }] : [])));
}

describe('a clean sprite', () => {
  it('has no Mistakes, even with one-pixel details like a cork and a glint', () => {
    expect(findMistakes(RED_POTION, { colorBudget: 7 })).toEqual([]);
  });
});

describe('orphan pixels', () => {
  it('flags a lone pixel floating away from the rest of the drawing', () => {
    const drawing = sprite([
      'O.......',
      '........',
      '...BBB..',
      '...BBB..',
      '........',
      '......H.',
    ]);
    expect(findMistakes(drawing)).toEqual([
      {
        kind: 'orphan-pixel',
        pixels: pointsOf(['x.......', '........', '........', '........', '........', '......x.']),
      },
    ]);
  });

  it('does not flag one-pixel details inside a shape, like eyes or a glint', () => {
    const drawing = sprite([
      'OOOOOOO',
      'OBBBBBO',
      'OBSBSBO',
      'OBBBBBO',
      'OBBHBBO',
      'OBBBBBO',
      'OOOOOOO',
    ]);
    expect(findMistakes(drawing)).toEqual([]);
  });
});

describe('doubles', () => {
  it('flags the corner pixels that thicken a 1px line into an L', () => {
    const drawing = sprite(['OOO.....', '..OO....', '....OO..', '......OO']);
    expect(findMistakes(drawing)).toEqual([
      { kind: 'doubles', pixels: pointsOf(['..x.....', '..x.....']) },
    ]);
  });

  it('flags the extra pixel inside the step of an outline around a filled shape', () => {
    const drawing = sprite(['...OO...', '..OOBO..', '..OBBO..', '...OO...']);
    expect(findMistakes(drawing)).toEqual([
      { kind: 'doubles', pixels: pointsOf(['........', '...x....']) },
    ]);
  });

  it('does not flag where colors meet inside a filled shape or along the canvas edge', () => {
    const halfway = sprite(['...BB...', '...BO...', '...BO...', '..BBBO..']);
    expect(findMistakes(halfway).map((m) => m.kind)).not.toContain('doubles');
    expect(findMistakes(sprite(['BBS', 'BSS']))).toEqual([]);
  });

  it('does not flag clean staircase lines, the corners of a box or a filled shape', () => {
    const drawing = sprite([
      'OO..........',
      '..OO...OOOO.',
      '....OO.O..O.',
      '.......OOOO.',
      '.O..........',
      '..O...BBB...',
      '..O..BBBBB..',
      '...O.BBBBB..',
    ]);
    expect(findMistakes(drawing)).toEqual([]);
  });
});

describe('too many colors', () => {
  it('flags the pixels of the least used colors beyond the color budget', () => {
    const drawing = sprite(['OOOO', 'BBB.', 'SS..', 'H...']);
    expect(findMistakes(drawing, { colorBudget: 2 })).toEqual([
      { kind: 'too-many-colors', pixels: pointsOf(['....', '....', 'xx..', 'x...']) },
    ]);
  });

  it('does not flag a drawing within its budget, or one with no budget', () => {
    const drawing = sprite(['OOOO', 'BBB.', 'SS..', 'H...']);
    expect(findMistakes(drawing, { colorBudget: 4 })).toEqual([]);
    expect(findMistakes(drawing)).toEqual([]);
  });
});

describe('low contrast', () => {
  const reds = (rows: string[]) => spriteOf(rows, 'ABC', ['#cc3333', '#c93535', '#881111']);

  it('flags the pixels on both sides of an edge between colors too close to tell apart', () => {
    const drawing = reds(['AAB.', 'AAB.', 'CCCC']);
    expect(findMistakes(drawing)).toEqual([
      { kind: 'low-contrast', pixels: pointsOf(['.xx.', '.xx.', '....']) },
    ]);
  });

  it('does not flag clearly different neighbors, or close colors that only touch at a corner', () => {
    const drawing = reds(['ACC', 'CBB', 'CBB']);
    expect(findMistakes(drawing)).toEqual([]);
  });
});

describe('the bundled palettes', () => {
  it.each(BUNDLED_PALETTES.map((p) => [p.name, p.colors] as const))(
    'have no two colors too close to tell apart side by side: %s',
    (_, colors) => {
      const pairs = colors.flatMap((_, a) => colors.slice(a + 1).map((_, i) => [a, a + 1 + i]));
      for (const pair of pairs) {
        const pairDrawing = { width: 2, height: 1, palette: colors, pixels: pair };
        expect(findMistakes(pairDrawing).map((m) => m.kind)).not.toContain('low-contrast');
      }
    },
  );
});
