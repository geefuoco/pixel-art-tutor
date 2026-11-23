import { describe, expect, it } from 'vitest';
import { createLesson, deriveSteps, type Role } from './lesson';
import { spriteOf } from './test-grids';

const PALETTE = ['#111111', '#cc3333', '#881111', '#ff9999', '#777777'];
const LEGEND = 'OBSHC';
const ROLES: Role[] = ['outline', 'base', 'shadow', 'highlight', 'base'];

const sprite = (rows: string[]) => spriteOf(rows, LEGEND, PALETTE);

const POT = sprite([
  '........',
  '..OOOO..',
  '.OHBBSO.',
  '.OBBSSO.',
  '..OOOO..',
  '...CC...',
  '........',
  '........',
]);

const EXPLANATIONS = {
  silhouette: 'Block in the shape.',
  outline: 'Draw the outline.',
  base: 'Fill the base colors.',
  shadow: 'Add shadow away from the light.',
  highlight: 'Add a highlight.',
};

describe('deriving Steps from Roles', () => {
  it('orders Steps silhouette, outline, base, shadow, highlight, each targeting its own pixels', () => {
    const steps = deriveSteps(POT, ROLES);
    expect(steps.map((s) => s.kind)).toEqual([
      'silhouette',
      'outline',
      'base',
      'shadow',
      'highlight',
    ]);
    expect(steps.map((s) => s.target)).toEqual([
      sprite([
        '........',
        '..BBBB..',
        '.BBBBBB.',
        '.BBBBBB.',
        '..BBBB..',
        '...BB...',
        '........',
        '........',
      ]).pixels,
      sprite([
        '........',
        '..OOOO..',
        '.O....O.',
        '.O....O.',
        '..OOOO..',
        '........',
        '........',
        '........',
      ]).pixels,
      sprite([
        '........',
        '........',
        '...BB...',
        '..BB....',
        '........',
        '...CC...',
        '........',
        '........',
      ]).pixels,
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
      sprite([
        '........',
        '........',
        '..H.....',
        '........',
        '........',
        '........',
        '........',
        '........',
      ]).pixels,
    ]);
  });

  it('blocks the silhouette in the most used base color unless another color is given', () => {
    const moreCork = sprite([
      'CCCB....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(deriveSteps(moreCork, ROLES)[0]!.target.slice(0, 5)).toEqual([4, 4, 4, 4, -1]);
    expect(deriveSteps(moreCork, ROLES, 0)[0]!.target.slice(0, 5)).toEqual([0, 0, 0, 0, -1]);
  });

  it('leaves out the Step of a Role no color has', () => {
    const flat = sprite([
      '.OO.....',
      'OBBO....',
      '.OO.....',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(deriveSteps(flat, ROLES).map((s) => s.kind)).toEqual(['silhouette', 'outline', 'base']);
  });
});

describe('a Lesson', () => {
  it('has a size, the Reference Sprite palette as its fixed palette, and an explanation per Step', () => {
    const lesson = createLesson({
      id: 'pot',
      title: 'A pot',
      reference: POT,
      roles: ROLES,
      explanations: EXPLANATIONS,
    });
    expect(lesson.size).toBe(8);
    expect(lesson.palette).toEqual(PALETTE);
    expect(lesson.steps.map((s) => [s.kind, s.explanation])).toEqual(Object.entries(EXPLANATIONS));
  });

  it('is square and 8, 16 or 32 pixels on a side', () => {
    const lessonOf = (width: number, height: number) => () =>
      createLesson({
        id: 'pot',
        title: 'A pot',
        reference: {
          width,
          height,
          palette: PALETTE,
          pixels: [0, ...new Array(width * height - 1).fill(-1)],
        },
        roles: ROLES,
        explanations: EXPLANATIONS,
      });
    expect(lessonOf(16, 16)).not.toThrow();
    expect(lessonOf(32, 32)).not.toThrow();
    for (const [w, h] of [
      [12, 12],
      [8, 16],
      [64, 64],
    ])
      expect(lessonOf(w!, h!)).toThrow(RangeError);
  });

  it('needs a Role for every palette color and an explanation for every Step', () => {
    const base = {
      id: 'pot',
      title: 'A pot',
      reference: POT,
      roles: ROLES,
      explanations: EXPLANATIONS,
    };
    expect(() => createLesson({ ...base, roles: ROLES.slice(0, 4) })).toThrow(/Role for every/);
    const noShadow = { ...EXPLANATIONS, shadow: undefined };
    expect(() => createLesson({ ...base, explanations: noShadow })).toThrow(/shadow/);
  });
});
