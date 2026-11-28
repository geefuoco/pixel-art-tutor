import { describe, expect, it } from 'vitest';
import { stillAnimation, type Animation } from './animation';
import { checkStep, passesMode, scoreLessonAttempt, stepGuide } from './evaluate';
import { createAnimationLesson, createLesson, createTilesetLesson, type Role } from './lesson';
import { spriteOf } from './test-grids';

const PALETTE = ['#111111', '#cc3333', '#881111', '#ff9999'];
const LEGEND = 'OBSH';
const ROLES: Role[] = ['outline', 'base', 'shadow', 'highlight'];
const sprite = (rows: string[]) => spriteOf(rows, LEGEND, PALETTE);

const LESSON = createLesson({
  id: 'pot',
  title: 'A pot',
  roles: ROLES,
  explanations: { silhouette: '', outline: '', base: '', shadow: '', highlight: '' },
  reference: sprite([
    '........',
    '..OOOO..',
    '.OHBBSO.',
    '.OBBSSO.',
    '..OOOO..',
    '........',
    '........',
    '........',
  ]),
});
const [SILHOUETTE, OUTLINE, BASE, SHADOW, HIGHLIGHT] = [0, 1, 2, 3, 4];

const BLANK = sprite(Array.from({ length: 8 }, () => '........'));
const BLOCKED_IN = sprite([
  '........',
  '..BBBB..',
  '.BBBBBB.',
  '.BBBBBB.',
  '..BBBB..',
  '........',
  '........',
  '........',
]);

function pointsOf(rows: string[]) {
  return rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === 'x' ? [{ x, y }] : [])));
}

describe('checking a Step', () => {
  it('reports every target pixel of the Step as missing on a blank canvas', () => {
    expect(checkStep(LESSON, OUTLINE, BLANK)).toEqual({
      missing: pointsOf(['........', '..xxxx..', '.x....x.', '.x....x.', '..xxxx..']),
      extra: [],
    });
  });

  it('passes the silhouette blocked in, and then wants the outline drawn over it', () => {
    expect(checkStep(LESSON, SILHOUETTE, BLOCKED_IN)).toEqual({ missing: [], extra: [] });
    expect(checkStep(LESSON, OUTLINE, BLOCKED_IN).missing).toHaveLength(12);
    expect(checkStep(LESSON, OUTLINE, BLOCKED_IN).extra).toEqual([]);
  });

  it('needs an exact color match: the silhouette in another color is missing', () => {
    const wrongColor = sprite([
      '........',
      '..BBBB..',
      '.BBBBBB.',
      '.BBBBBB.',
      '..BBBH..',
      '........',
      '........',
      '........',
    ]);
    expect(checkStep(LESSON, SILHOUETTE, wrongColor)).toEqual({
      missing: [{ x: 5, y: 4 }],
      extra: [],
    });
  });

  it('does not count pixels of later Steps as extra or missing, so drawing ahead is fine', () => {
    for (const step of [SILHOUETTE, OUTLINE, BASE, SHADOW, HIGHLIGHT]) {
      expect(checkStep(LESSON, step, LESSON.reference)).toEqual({ missing: [], extra: [] });
    }
    const outlineWithStrayShading = sprite([
      '........',
      '..OOOO..',
      '.O..H.O.',
      '.OSS..O.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ]);
    expect(checkStep(LESSON, OUTLINE, outlineWithStrayShading)).toEqual({ missing: [], extra: [] });
  });

  it('reports pixels outside the sprite as extra, and earlier-Step pixels not right as missing', () => {
    const drawing = sprite([
      'O.......',
      '..OOOO..',
      '.OBBBBB.',
      '.OBBBB..',
      '..OOOO..',
      '.......H',
      '........',
      '........',
    ]);
    expect(checkStep(LESSON, BASE, drawing)).toEqual({
      missing: [
        { x: 6, y: 2 },
        { x: 6, y: 3 },
      ],
      extra: [
        { x: 0, y: 0 },
        { x: 7, y: 5 },
      ],
    });
  });
});

describe('scoring a Lesson', () => {
  const withMistakes = (count: number) => {
    const pixels = LESSON.reference.pixels.slice();
    pixels.forEach((p, i) => {
      if (p !== -1 && count > 0) {
        pixels[i] = p === 1 ? 2 : 1;
        count--;
      }
    });
    return { ...LESSON.reference, pixels };
  };

  it('scores the Reference Sprite itself 100% and a blank canvas 0%', () => {
    expect(scoreLessonAttempt(LESSON, stillAnimation(LESSON.reference))).toBe(1);
    expect(scoreLessonAttempt(LESSON, stillAnimation(BLANK))).toBe(0);
  });

  it('passes at exactly 95% of the 20 sprite pixels right, and fails one pixel below', () => {
    expect(scoreLessonAttempt(LESSON, stillAnimation(withMistakes(1)))).toBe(0.95);
    expect(passesMode('trace', scoreLessonAttempt(LESSON, stillAnimation(withMistakes(1))))).toBe(
      true,
    );
    expect(scoreLessonAttempt(LESSON, stillAnimation(withMistakes(2)))).toBe(0.9);
    expect(passesMode('trace', scoreLessonAttempt(LESSON, stillAnimation(withMistakes(2))))).toBe(
      false,
    );
  });

  it('counts pixels drawn outside the sprite against the score', () => {
    const pixels = LESSON.reference.pixels.slice();
    pixels[0] = 0;
    expect(scoreLessonAttempt(LESSON, stillAnimation({ ...LESSON.reference, pixels }))).toBe(
      20 / 21,
    );
  });
});

describe('checking and scoring an animation Lesson', () => {
  const BOB = [
    [
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ],
    [
      '........',
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
      '........',
      '........',
    ],
  ];
  const BOBBING: Animation = {
    width: 8,
    height: 8,
    palette: PALETTE,
    fps: 4,
    frames: BOB.map((rows) => sprite(rows).pixels),
  };
  const ANIMATED = createAnimationLesson({
    id: 'bob',
    title: 'Bob',
    animation: BOBBING,
    roles: ROLES,
    frameSteps: [
      { frame: 1, pose: 'key', explanation: '' },
      { frame: 0, pose: 'in-between', explanation: '' },
    ],
  });
  const LOW_FRAME_STEP = 0;

  it('checks a Frame-Step against the whole Frame, in its final colors', () => {
    expect(checkStep(ANIMATED, LOW_FRAME_STEP, sprite(BOB[1]!))).toEqual({
      missing: [],
      extra: [],
    });
    expect(checkStep(ANIMATED, LOW_FRAME_STEP, sprite(BOB[0]!))).toEqual({
      missing: pointsOf(['........', '........', '..xxxx..', '........', '.xxxxxx.', '..xxxx..']),
      extra: pointsOf(['........', '..xxxx..', '.x....x.']),
    });
    const blockedIn = sprite(
      ['........', '........', '..BBBB..', '.BBBBBB.', '.BBBBBB.', '..BBBB..'].concat([
        '........',
        '........',
      ]),
    );
    expect(checkStep(ANIMATED, LOW_FRAME_STEP, blockedIn).missing).toHaveLength(12);
  });

  it('drops pixels of a Frame already drawn right from its Guide', () => {
    const outlined = sprite([
      '........',
      '........',
      '..OOOO..',
      '.O....O.',
      '.O....O.',
      '..OOOO..',
      '........',
      '........',
    ]);
    expect(stepGuide(ANIMATED, LOW_FRAME_STEP, outlined)).toEqual(
      sprite([
        '........',
        '........',
        '........',
        '..BBBB..',
        '..BBBB..',
        '........',
        '........',
        '........',
      ]).pixels,
    );
  });

  it('scores every Frame together against the Reference Sprite', () => {
    expect(scoreLessonAttempt(ANIMATED, BOBBING)).toBe(1);
    const onlyFirstFrame = { ...BOBBING, frames: [BOBBING.frames[0]!, BLANK.pixels] };
    expect(scoreLessonAttempt(ANIMATED, onlyFirstFrame)).toBe(0.5);
  });
});

describe('checking a tileset Lesson', () => {
  const row = (fill: string, at = -1, other = '') =>
    [...fill.repeat(16)].map((c, x) => (x === at ? other : c)).join('');
  const GROUND = Array.from({ length: 16 }, (_, y) => (y === 3 ? row('B', 9, 'S') : row('B')));
  const EDGE = Array.from({ length: 16 }, (_, y) => (y < 2 ? row('.') : row('B')));
  const TILESET = createTilesetLesson({
    id: 'path',
    title: 'Path',
    tiles: {
      width: 16,
      height: 16,
      palette: PALETTE,
      fps: 8,
      frames: [GROUND, EDGE].map((rows) => sprite(rows).pixels),
    },
    roles: ROLES,
    tileSteps: [
      { name: 'Ground', seamless: ['left-right', 'top-bottom'], explanation: '' },
      { name: 'Top edge', seamless: ['left-right'], explanation: '' },
    ],
  });
  const EDGE_STEP = 1;

  it('checks a tile Step against the whole tile, in its final colors', () => {
    expect(checkStep(TILESET, EDGE_STEP, sprite(EDGE))).toEqual({ missing: [], extra: [] });
    expect(checkStep(TILESET, EDGE_STEP, sprite(GROUND))).toEqual({
      missing: [{ x: 9, y: 3 }],
      extra: Array.from({ length: 32 }, (_, i) => ({ x: i % 16, y: Math.floor(i / 16) })),
    });
  });
});

describe('the Guide for a Step', () => {
  it('shows the whole target on a blank canvas', () => {
    expect(stepGuide(LESSON, BASE, BLANK)).toEqual(
      sprite([
        '........',
        '........',
        '...BB...',
        '..BB....',
        '........',
        '........',
        '........',
        '........',
      ]).pixels,
    );
  });

  it('leaves out base pixels the Silhouette Step already blocked in', () => {
    expect(stepGuide(LESSON, BASE, BLOCKED_IN)).toEqual(BLANK.pixels);
    expect(stepGuide(LESSON, SHADOW, BLOCKED_IN)).toEqual(
      sprite([
        '........',
        '........',
        '.....S..',
        '....SS..',
        '........',
        '........',
        '........',
        '........',
      ]).pixels,
    );
  });

  it('keeps a pixel drawn in the wrong color, and drops one once it is drawn right', () => {
    const drawing = sprite([
      '........',
      '........',
      '.....S..',
      '....B...',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(stepGuide(LESSON, SHADOW, drawing)).toEqual(
      sprite([
        '........',
        '........',
        '........',
        '....SS..',
        '........',
        '........',
        '........',
        '........',
      ]).pixels,
    );
  });

  it('drops a silhouette pixel already drawn in its final color, as Check counts it right', () => {
    const drawing = sprite([
      '........',
      '..O.....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(stepGuide(LESSON, SILHOUETTE, drawing)).toEqual(
      sprite([
        '........',
        '...BBB..',
        '.BBBBBB.',
        '.BBBBBB.',
        '..BBBB..',
        '........',
        '........',
        '........',
      ]).pixels,
    );
  });
});
