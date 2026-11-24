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

describe('jaggies', () => {
  it('flags a run that breaks the rhythm of a line', () => {
    const drawing = sprite(['OOO........', '...O.......', '....OOO....', '.......OOOO']);
    expect(findMistakes(drawing)).toEqual([
      { kind: 'jaggies', pixels: pointsOf(['...........', '...x.......']) },
    ]);
  });

  it('flags a run that sticks out of a steep line, and a flat bump in a diagonal', () => {
    const steep = sprite([
      'O....',
      'O....',
      '.O...',
      '.O...',
      '..O..',
      '..O..',
      '..O..',
      '...O.',
      '...O.',
      '....O',
    ]);
    expect(findMistakes(steep)).toEqual([
      {
        kind: 'jaggies',
        pixels: pointsOf(['.....', '.....', '.....', '.....', '..x..', '..x..', '..x..']),
      },
    ]);
    const bump = sprite(['O.......', '.O......', '..OO....', '....O...', '.....O..']);
    expect(findMistakes(bump)).toEqual([
      { kind: 'jaggies', pixels: pointsOf(['........', '........', '..xx....']) },
    ]);
  });

  it('does not flag steady lines, curves that ease in, alternations or dithering', () => {
    const drawing = sprite([
      'OO..........OOOO.......',
      '..OO............OOO....',
      '....OO.............OO..',
      '......OO.............O.',
      '.....................O.',
      'OO...........H.H.H.H...',
      '..O...........H.H.H.H..',
      '...OO........H.H.H.H...',
      '.....O........H.H.H.H..',
      '......OO...............',
    ]);
    expect(findMistakes(drawing).map((m) => m.kind)).not.toContain('jaggies');
  });
});

describe('banding', () => {
  it('flags bands of different colors whose steps line up along a line', () => {
    const drawing = sprite([
      'OOO.........',
      'SSSOOO......',
      '...SSSOOO...',
      '......SSSOOO',
      '.........SSS',
    ]);
    expect(findMistakes(drawing)).toEqual([
      {
        kind: 'banding',
        pixels: pointsOf([
          'xxx.........',
          'xxxxxx......',
          '...xxxxxx...',
          '......xxxxxx',
          '.........xxx',
        ]),
      },
    ]);
  });

  it('flags bands along a steep line too', () => {
    const drawing = sprite(['OS...', 'OS...', '.OS..', '.OS..', '..OS.', '..OS.']);
    expect(findMistakes(drawing)).toEqual([
      { kind: 'banding', pixels: pointsOf(['xx...', 'xx...', '.xx..', '.xx..', '..xx.', '..xx.']) },
    ]);
  });

  it('does not flag bands whose steps are offset, short bands, or an outline around a fill', () => {
    const offset = sprite([
      'OOO.........',
      'SSSOOO......',
      '..SSSSOOO...',
      '.....SSSSOOO',
      '........SSSS',
    ]);
    const short = sprite(['OOO...', 'SSSOOO', '...SSS']);
    const filled = sprite(['...OOO...', '.OO.BB.OO', 'O.BBBBBB.', 'OBBBBBBBO', '.OOOOOOO.']);
    for (const drawing of [offset, short, filled]) {
      expect(findMistakes(drawing).map((m) => m.kind)).not.toContain('banding');
    }
  });
});

describe('pillow shading', () => {
  it('flags shading in rings that follow the outline all the way around', () => {
    const drawing = sprite([
      '.OOOOOOO.',
      'OSSSSSSSO',
      'OSBBBBBSO',
      'OSBHHHBSO',
      'OSBHHHBSO',
      'OSBHHHBSO',
      'OSBBBBBSO',
      'OSSSSSSSO',
      '.OOOOOOO.',
    ]);
    expect(findMistakes(drawing)).toEqual([
      {
        kind: 'pillow-shading',
        pixels: pointsOf([
          '.........',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.xxxxxxx.',
          '.........',
        ]),
      },
    ]);
  });

  it('does not flag shading lit from one side, flat colors, a glint or a rim', () => {
    const litFromTopLeft = sprite([
      '.OOOOOOO.',
      'OHHBBBBBO',
      'OHBBBBBSO',
      'OBBBBBSSO',
      'OBBBBBSSO',
      'OBBBBSSSO',
      'OBBBSSSSO',
      'OBSSSSSSO',
      '.OOOOOOO.',
    ]);
    const flat = sprite(['.OOOOO.', 'OBBBBBO', 'OBBBBBO', 'OBBBBBO', '.OOOOO.']);
    const glint = sprite(['OOOOO', 'OBBBO', 'OBHBO', 'OBBBO', 'OOOOO']);
    const coin = sprite([
      'OOOOOOOOO',
      'OBBBBBBBO',
      'OBOOOOOBO',
      'OBOBBBOBO',
      'OBOBBBOBO',
      'OBOBBBOBO',
      'OBOOOOOBO',
      'OBBBBBBBO',
      'OOOOOOOOO',
    ]);
    for (const drawing of [litFromTopLeft, flat, glint, coin]) {
      expect(findMistakes(drawing).map((m) => m.kind)).not.toContain('pillow-shading');
    }
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
