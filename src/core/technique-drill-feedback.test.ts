import { describe, expect, it } from 'vitest';
import { TRANSPARENT, type Drawing } from './drawing';
import { readTechniqueDrills, type TechniqueDrill } from './technique-drill';
import { techniqueDrillFeedback } from './technique-drill-feedback';

const PALETTE = ['#111111', '#3366cc', '#1a3366', '#99bbff'];
const LETTERS = 'OBSH';

function sprite(rows: string[]): Drawing {
  return {
    width: rows[0]!.length,
    height: rows.length,
    palette: PALETTE,
    pixels: rows.flatMap((row) =>
      [...row].map((c) => (c === '.' ? TRANSPARENT : LETTERS.indexOf(c))),
    ),
  };
}

function drill(manifest: Record<string, unknown>): TechniqueDrill {
  const start = sprite(['O.......', ...Array.from({ length: 7 }, () => '........')]);
  const reading = readTechniqueDrills({
    techniques: { shading: 'l', outline: 'l', tiling: 'l' },
    course: ['l'],
    drills: [
      {
        manifest: {
          id: 'drill',
          title: 'Drill',
          instruction: 'Do it.',
          roles: {
            '#111111': 'outline',
            '#3366cc': 'base',
            '#1a3366': 'shadow',
            '#99bbff': 'highlight',
          },
          ...manifest,
        },
        start: {
          width: 8,
          height: 8,
          data: start.pixels.flatMap((p) => (p === 0 ? [0x11, 0x11, 0x11, 255] : [0, 0, 0, 0])),
        },
      },
    ],
  });
  if (!reading.ok) throw new Error(reading.problem);
  return reading.drills[0]!;
}

const SHADING = drill({
  technique: 'shading',
  checks: ['shadow-away-from-light', 'highlight-toward-light'],
  light: 'top-left',
});

const outcomes = (d: TechniqueDrill, rows: string[]) =>
  techniqueDrillFeedback(d, sprite(rows)).checks.map(({ label, outcome }) => [label, outcome]);

describe('Technique Drill checks for light direction', () => {
  it('meets both when shadow faces away from the light and the highlight faces it', () => {
    expect(
      outcomes(SHADING, [
        '........',
        '..OOOO..',
        '.OHBBBO.',
        '.OBBBSO.',
        '.OBBBSO.',
        '.OBSSSO.',
        '..OOOO..',
        '........',
      ]),
    ).toEqual([
      ['Shadow away from the light (from the top left)', 'met'],
      ['Highlight facing the light (from the top left)', 'met'],
    ]);
  });

  it('meets neither when the shading is on the wrong sides', () => {
    expect(
      outcomes(SHADING, [
        '........',
        '..OOOO..',
        '.OSSSBO.',
        '.OSBBBO.',
        '.OSBBBO.',
        '.OBBBHO.',
        '..OOOO..',
        '........',
      ]).map(([, outcome]) => outcome),
    ).toEqual(['unmet', 'unmet']);
  });

  it('does not meet the shadow check for shadow all the way round the edge', () => {
    expect(
      outcomes(SHADING, [
        '..OOOO..',
        '.OSSSSO.',
        'OSSBBSSO',
        'OSBBBBSO',
        'OSBBBBSO',
        'OSSBBSSO',
        '.OSSSSO.',
        '..OOOO..',
      ])[0],
    ).toEqual(['Shadow away from the light (from the top left)', 'unmet']);
  });

  it('meets neither before any shadow or highlight is drawn', () => {
    expect(
      outcomes(SHADING, [
        '..OOOO..',
        '.OBBBBO.',
        '.OBBBBO.',
        '..OOOO..',
        '........',
        '........',
        '........',
        '........',
      ]).map(([, outcome]) => outcome),
    ).toEqual(['unmet', 'unmet']);
  });

  it('follows the light the drill names', () => {
    const fromAbove = drill({
      technique: 'shading',
      checks: ['shadow-away-from-light'],
      light: 'above',
    });
    const shadedBelow = [
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '.OSSSSO.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ];
    expect(outcomes(fromAbove, shadedBelow)).toEqual([
      ['Shadow away from the light (from above)', 'met'],
    ]);
    const fromRight = drill({
      technique: 'shading',
      checks: ['shadow-away-from-light'],
      light: 'right',
    });
    expect(outcomes(fromRight, shadedBelow)).toEqual([
      ['Shadow away from the light (from the right)', 'unmet'],
    ]);
  });
});

describe('Technique Drill checks for outlines', () => {
  const OUTLINE = drill({ technique: 'outline', checks: ['closed-outline', 'clean-outline'] });
  const BALL = [
    '........',
    '..OOOO..',
    '.OBBBBO.',
    '.OBBBBO.',
    '.OBBBBO.',
    '.OBBBBO.',
    '..OOOO..',
    '........',
  ];

  it('meets both for a closed outline 1 pixel wide', () => {
    expect(outcomes(OUTLINE, BALL)).toEqual([
      ['The outline goes all the way round', 'met'],
      ['The outline is 1 pixel wide, with no jaggies', 'met'],
    ]);
  });

  it('does not meet the closed check when the base shows at the edge', () => {
    const gap = BALL.map((row, y) => (y === 3 ? '.BBBBBO.' : row));
    expect(outcomes(OUTLINE, gap)[0]).toEqual(['The outline goes all the way round', 'unmet']);
  });

  it('does not meet the clean check for an outline 2 pixels thick', () => {
    const thick = BALL.map((row, y) => (y === 2 ? '.OOOOOO.' : row));
    expect(outcomes(OUTLINE, thick)[1]).toEqual([
      'The outline is 1 pixel wide, with no jaggies',
      'unmet',
    ]);
  });

  it('does not meet the clean check for outline-colored pixels only inside the shape', () => {
    const eyes = BALL.map((_, y) => (y === 3 ? 'BBOBBOBB' : 'BBBBBBBB'));
    expect(outcomes(OUTLINE, eyes)[1]).toEqual([
      'The outline is 1 pixel wide, with no jaggies',
      'unmet',
    ]);
  });

  it('meets neither on an empty canvas', () => {
    expect(
      outcomes(
        OUTLINE,
        Array.from({ length: 8 }, () => '........'),
      ).map(([, o]) => o),
    ).toEqual(['unmet', 'unmet']);
  });
});

describe('Technique Drill checks for tiles', () => {
  const TILE = drill({ technique: 'tiling', checks: ['seamless'], seamless: ['left-right'] });
  const plain = Array.from({ length: 8 }, () => 'BBBBBBBB');

  it('meets the seamless check for a tile whose edges continue each other', () => {
    expect(outcomes(TILE, plain)).toEqual([['Repeats left to right without a seam', 'met']]);
  });

  it('does not meet it, and marks the seam, where the edges meet in a new pairing', () => {
    const seamed = plain.map((row, y) => (y === 3 ? 'SBBBBBBO' : row));
    const feedback = techniqueDrillFeedback(TILE, sprite(seamed));
    expect(feedback.checks).toEqual([
      { label: 'Repeats left to right without a seam', outcome: 'unmet' },
    ]);
    expect(feedback.mistakes.map((m) => m.kind)).toContain('seam');
  });
});
