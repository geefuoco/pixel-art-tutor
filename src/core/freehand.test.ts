import { describe, expect, it } from 'vitest';
import { TRANSPARENT, type Drawing } from './drawing';
import { passesMode } from './evaluate';
import { scoreFreehand } from './freehand';
import { createLesson, type Role } from './lesson';
import { spriteOf } from './test-grids';

const PALETTE = ['#111111', '#cc3333', '#881111', '#ff9999'];
const LEGEND = 'OBSH';
const ROLES: Role[] = ['outline', 'base', 'shadow', 'highlight'];
const sprite = (rows: string[]) => spriteOf(rows, LEGEND, PALETTE);

const SQUARE = createLesson({
  id: 'square',
  title: 'A square',
  roles: ROLES,
  explanations: { silhouette: '', base: '' },
  reference: sprite([
    '........',
    '........',
    '..BBBB..',
    '..BBBB..',
    '..BBBB..',
    '..BBBB..',
    '........',
    '........',
  ]),
});

function rectangleOn(canvas: number, width: number, height: number, color = 1): Drawing {
  const pixels = Array.from({ length: canvas * canvas }, (_, i) => {
    const [x, y] = [i % canvas, Math.floor(i / canvas)];
    return x >= 3 && x < 3 + width && y >= 5 && y < 5 + height ? color : TRANSPARENT;
  });
  return { width: canvas, height: canvas, palette: PALETTE, pixels };
}

const POT_PALETTE = [...PALETTE, '#dd4444'];
const POT = createLesson({
  id: 'pot',
  title: 'A pot',
  roles: [...ROLES, 'base'],
  explanations: { silhouette: '', outline: '', base: '', shadow: '', highlight: '' },
  reference: spriteOf(
    [
      '........',
      '..OOOO..',
      '.OHBBSO.',
      '.OBBSSO.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ],
    'OBSHb',
    POT_PALETTE,
  ),
});
const pot = (rows: string[], palette = POT_PALETTE) => spriteOf(rows, 'OBSHbX', palette);

describe('the Shape sub-score', () => {
  it('scores the Reference Sprite itself 100%', () => {
    expect(scoreFreehand(SQUARE, SQUARE.reference).shape).toBe(1);
  });

  it('is not lowered by drawing the shape somewhere else on the canvas', () => {
    const shifted = sprite([
      'BBBB....',
      'BBBB....',
      'BBBB....',
      'BBBB....',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(SQUARE, shifted).shape).toBe(1);
  });

  it('accepts the shape drawn up to 2px larger or smaller, on a canvas bigger than the Lesson', () => {
    expect(scoreFreehand(SQUARE, rectangleOn(16, 6, 6)).shape).toBe(1);
    expect(scoreFreehand(SQUARE, rectangleOn(16, 2, 2)).shape).toBe(1);
    expect(scoreFreehand(SQUARE, rectangleOn(16, 5, 3)).shape).toBe(1);
  });

  it('stops forgiving the size beyond 2px, comparing with the closest allowed size', () => {
    expect(scoreFreehand(SQUARE, rectangleOn(16, 7, 7)).shape).toBe(36 / 49);
    expect(scoreFreehand(SQUARE, rectangleOn(16, 1, 1)).shape).toBe(1 / 4);
  });

  it('scores 0 for a blank canvas', () => {
    expect(scoreFreehand(SQUARE, rectangleOn(8, 0, 0)).shape).toBe(0);
  });
});

describe('the Palette sub-score', () => {
  it('scores 100% for each Role in its place, even shifted and in another color of that Role', () => {
    const otherBase = pot([
      '.OOOO...',
      'OHbbSO..',
      'ObbSSO..',
      '.OOOO...',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(POT, POT.reference).palette).toBe(1);
    expect(scoreFreehand(POT, otherBase).palette).toBe(1);
  });

  it('marks down shading on the wrong side: 4 of 20 pixels have the wrong Role', () => {
    const lightFromTheRight = pot([
      '........',
      '..OOOO..',
      '.OSBBHO.',
      '.OBBHHO.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(POT, lightFromTheRight).palette).toBe(0.8);
  });

  it('marks down a silhouette filled in the base color, where only 4 of 20 pixels are base', () => {
    const flat = pot([
      '........',
      '..BBBB..',
      '.BBBBBB.',
      '.BBBBBB.',
      '..BBBB..',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(POT, flat).palette).toBe(0.2);
  });

  it('marks down colors that are not in the Lesson palette', () => {
    const offPalette = pot(
      [
        '........',
        '..XOOO..',
        '.OHBBSO.',
        '.OBBSSO.',
        '..OOOO..',
        '........',
        '........',
        '........',
      ],
      [...POT_PALETTE, '#00ff00'],
    );
    expect(scoreFreehand(POT, offPalette).palette).toBe(19 / 20);
  });
});

describe('Line quality and the overall score', () => {
  it('scores a faithful copy 100% on every count, with no Mistakes', () => {
    expect(scoreFreehand(POT, POT.reference)).toEqual({
      shape: 1,
      palette: 1,
      lineQuality: 1,
      overall: 1,
      mistakes: [],
    });
  });

  it('marks Line quality down by the share of pixels with a Mistake, and averages the three', () => {
    const score = scoreFreehand(
      POT,
      pot([
        '........',
        '..OOOO..',
        '.OHBBSO.',
        '.OBBSSO.',
        '..OOOO..',
        '........',
        '......O.',
        '........',
      ]),
    );
    expect(score.mistakes).toEqual([{ kind: 'orphan-pixel', pixels: [{ x: 6, y: 6 }] }]);
    expect(score.lineQuality).toBe(20 / 21);
    expect(score.shape).toBe(20 / 21);
    expect(score.palette).toBe(1);
    expect(score.overall).toBeCloseTo(61 / 63, 12);
  });

  it('scores a blank canvas 0', () => {
    expect(scoreFreehand(POT, pot(Array.from({ length: 8 }, () => '........')))).toEqual({
      shape: 0,
      palette: 0,
      lineQuality: 0,
      overall: 0,
      mistakes: [],
    });
  });
});

describe('passing Freehand', () => {
  it('passes at an overall score of 90%, lower than the 95% Trace and Hint need', () => {
    expect(passesMode('freehand', 0.9)).toBe(true);
    expect(passesMode('freehand', 0.8999)).toBe(false);
    expect(passesMode('trace', 0.9)).toBe(false);
    expect(passesMode('hint', 0.95)).toBe(true);
  });

  it('passes a drawing that scores exactly 90% overall, and fails one wrong Role more', () => {
    const sixWrongRoles = pot([
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOBB..',
      '........',
      '........',
      '........',
    ]);
    const sevenWrongRoles = pot([
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OBBB..',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(POT, sixWrongRoles)).toMatchObject({ shape: 1, lineQuality: 1 });
    expect(scoreFreehand(POT, sixWrongRoles).palette).toBeCloseTo(0.7, 12);
    expect(passesMode('freehand', scoreFreehand(POT, sixWrongRoles).overall)).toBe(true);
    expect(scoreFreehand(POT, sevenWrongRoles).overall).toBeCloseTo(2.65 / 3, 12);
    expect(passesMode('freehand', scoreFreehand(POT, sevenWrongRoles).overall)).toBe(false);
  });

  it('passes a shifted drawing shaded from the wrong side, but not a flat silhouette', () => {
    const lightFromTheRight = pot([
      '........',
      '........',
      '.OOOO...',
      'OSBBHO..',
      'OBBHHO..',
      '.OOOO...',
      '........',
      '........',
    ]);
    const flat = pot([
      '........',
      '..BBBB..',
      '.BBBBBB.',
      '.BBBBBB.',
      '..BBBB..',
      '........',
      '........',
      '........',
    ]);
    expect(scoreFreehand(POT, lightFromTheRight).overall).toBeCloseTo(2.8 / 3, 12);
    expect(passesMode('freehand', scoreFreehand(POT, lightFromTheRight).overall)).toBe(true);
    expect(passesMode('freehand', scoreFreehand(POT, flat).overall)).toBe(false);
  });
});
