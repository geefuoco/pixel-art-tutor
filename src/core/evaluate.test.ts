import { describe, expect, it } from 'vitest';
import { checkStep, passesMode, scoreLessonDrawing } from './evaluate';
import { createLesson, type Role } from './lesson';
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
    expect(scoreLessonDrawing(LESSON, LESSON.reference)).toBe(1);
    expect(scoreLessonDrawing(LESSON, BLANK)).toBe(0);
  });

  it('passes at exactly 95% of the 20 sprite pixels right, and fails one pixel below', () => {
    expect(scoreLessonDrawing(LESSON, withMistakes(1))).toBe(0.95);
    expect(passesMode('trace', scoreLessonDrawing(LESSON, withMistakes(1)))).toBe(true);
    expect(scoreLessonDrawing(LESSON, withMistakes(2))).toBe(0.9);
    expect(passesMode('trace', scoreLessonDrawing(LESSON, withMistakes(2)))).toBe(false);
  });

  it('counts pixels drawn outside the sprite against the score', () => {
    const pixels = LESSON.reference.pixels.slice();
    pixels[0] = 0;
    expect(scoreLessonDrawing(LESSON, { ...LESSON.reference, pixels })).toBe(20 / 21);
  });
});
