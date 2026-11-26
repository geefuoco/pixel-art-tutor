import { describe, expect, it } from 'vitest';
import { stillAnimation, type Animation } from './animation';
import { TRANSPARENT, type Drawing } from './drawing';
import { passesMode } from './evaluate';
import { scoreFreehand } from './freehand';
import { createAnimationLesson, createLesson, createTilesetLesson, type Role } from './lesson';
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
    expect(scoreFreehand(SQUARE, stillAnimation(SQUARE.reference)).shape).toBe(1);
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
    expect(scoreFreehand(SQUARE, stillAnimation(shifted)).shape).toBe(1);
  });

  it('accepts the shape drawn up to 2px larger or smaller, on a canvas bigger than the Lesson', () => {
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(16, 6, 6))).shape).toBe(1);
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(16, 2, 2))).shape).toBe(1);
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(16, 5, 3))).shape).toBe(1);
  });

  it('stops forgiving the size beyond 2px, comparing with the closest allowed size', () => {
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(16, 7, 7))).shape).toBe(36 / 49);
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(16, 1, 1))).shape).toBe(1 / 4);
  });

  it('scores 0 for a blank canvas', () => {
    expect(scoreFreehand(SQUARE, stillAnimation(rectangleOn(8, 0, 0))).shape).toBe(0);
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
    expect(scoreFreehand(POT, stillAnimation(POT.reference)).palette).toBe(1);
    expect(scoreFreehand(POT, stillAnimation(otherBase)).palette).toBe(1);
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
    expect(scoreFreehand(POT, stillAnimation(lightFromTheRight)).palette).toBe(0.8);
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
    expect(scoreFreehand(POT, stillAnimation(flat)).palette).toBe(0.2);
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
    expect(scoreFreehand(POT, stillAnimation(offPalette)).palette).toBe(19 / 20);
  });
});

describe('Line quality and the overall score', () => {
  it('scores a faithful copy 100% on every count, with no Mistakes', () => {
    expect(scoreFreehand(POT, stillAnimation(POT.reference))).toEqual({
      shape: 1,
      palette: 1,
      lineQuality: 1,
      overall: 1,
      mistakes: [[]],
    });
  });

  it('marks Line quality down by the share of pixels with a Mistake, and averages the three', () => {
    const score = scoreFreehand(
      POT,
      stillAnimation(
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
      ),
    );
    expect(score.mistakes).toEqual([[{ kind: 'orphan-pixel', pixels: [{ x: 6, y: 6 }] }]]);
    expect(score.lineQuality).toBe(20 / 21);
    expect(score.shape).toBe(20 / 21);
    expect(score.palette).toBe(1);
    expect(score.overall).toBeCloseTo(61 / 63, 12);
  });

  it('scores a blank canvas 0', () => {
    expect(
      scoreFreehand(POT, stillAnimation(pot(Array.from({ length: 8 }, () => '........')))),
    ).toEqual({
      shape: 0,
      palette: 0,
      lineQuality: 0,
      overall: 0,
      mistakes: [[]],
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
    expect(scoreFreehand(POT, stillAnimation(sixWrongRoles))).toMatchObject({
      shape: 1,
      lineQuality: 1,
    });
    expect(scoreFreehand(POT, stillAnimation(sixWrongRoles)).palette).toBeCloseTo(0.7, 12);
    expect(passesMode('freehand', scoreFreehand(POT, stillAnimation(sixWrongRoles)).overall)).toBe(
      true,
    );
    expect(scoreFreehand(POT, stillAnimation(sevenWrongRoles)).overall).toBeCloseTo(2.65 / 3, 12);
    expect(
      passesMode('freehand', scoreFreehand(POT, stillAnimation(sevenWrongRoles)).overall),
    ).toBe(false);
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
    expect(scoreFreehand(POT, stillAnimation(lightFromTheRight)).overall).toBeCloseTo(2.8 / 3, 12);
    expect(
      passesMode('freehand', scoreFreehand(POT, stillAnimation(lightFromTheRight)).overall),
    ).toBe(true);
    expect(passesMode('freehand', scoreFreehand(POT, stillAnimation(flat)).overall)).toBe(false);
  });
});

describe('Freehand in an animation Lesson', () => {
  const HIGH = [
    '........',
    '..OOOO..',
    '.OBBBBO.',
    '.OBBBBO.',
    '..OOOO..',
    '........',
    '........',
    '........',
  ];
  const LOW = [
    '........',
    '........',
    '..OOOO..',
    '.OBBBBO.',
    '.OBBBBO.',
    '..OOOO..',
    '........',
    '........',
  ];
  const frames = (...rows: string[][]) => rows.map((r) => sprite(r).pixels);
  const BOB = createAnimationLesson({
    id: 'bob',
    title: 'Bob',
    roles: ROLES,
    animation: { width: 8, height: 8, palette: PALETTE, fps: 4, frames: frames(HIGH, LOW) },
    frameSteps: [
      { frame: 0, pose: 'key', explanation: '' },
      { frame: 1, pose: 'in-between', explanation: '' },
    ],
  });
  const attempt = (...rows: string[][]): Animation => ({
    width: 8,
    height: 8,
    palette: PALETTE,
    fps: 4,
    frames: frames(...rows),
  });
  const BLANK = Array.from({ length: 8 }, () => '........');

  it('scores each Frame against its own Reference Frame, wherever it is drawn', () => {
    expect(scoreFreehand(BOB, attempt(LOW, HIGH)).overall).toBe(1);
  });

  it('averages the Frames, so a Frame left blank halves the score', () => {
    expect(scoreFreehand(BOB, attempt(HIGH, BLANK))).toEqual({
      shape: 0.5,
      palette: 0.5,
      lineQuality: 0.5,
      overall: 0.5,
      mistakes: [[], []],
    });
  });
});

describe('scoring a tileset Lesson in Freehand', () => {
  const GROUND = Array<string>(16).fill('B'.repeat(16));
  const TILESET = createTilesetLesson({
    id: 'ground',
    title: 'Ground',
    tiles: { width: 16, height: 16, palette: PALETTE, fps: 8, frames: [sprite(GROUND).pixels] },
    roles: ROLES,
    tileSteps: [{ name: 'Ground', seamless: ['left-right', 'top-bottom'], explanation: '' }],
  });

  it('counts seams against Line quality, since a tile has to repeat cleanly', () => {
    const shadedAcross = Array<string>(16).fill('H' + 'B'.repeat(14) + 'S');
    const score = scoreFreehand(TILESET, stillAnimation(sprite(shadedAcross)));
    expect(score.mistakes[0]!.map((m) => [m.kind, m.pixels.length])).toEqual([['seam', 32]]);
    expect(score.lineQuality).toBe(1 - 32 / 256);
    expect(scoreFreehand(TILESET, TILESET.animation).lineQuality).toBe(1);
  });
});
