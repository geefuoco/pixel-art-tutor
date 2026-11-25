import { describe, expect, it } from 'vitest';
import type { RgbaImage } from './png';
import { readTechniqueDrills } from './technique-drill';

const COLORS: Record<string, number[]> = {
  O: [0x11, 0x11, 0x11, 255],
  B: [0x33, 0x66, 0xcc, 255],
  '.': [0, 0, 0, 0],
  '~': [0x33, 0x66, 0xcc, 128],
};

function imageOf(rows: string[]): RgbaImage {
  return {
    width: rows[0]!.length,
    height: rows.length,
    data: rows.flatMap((row) => [...row].flatMap((c) => COLORS[c]!)),
  };
}

const BALL_ROWS = [
  '........',
  '..OOOO..',
  '.OBBBBO.',
  '.OBBBBO.',
  '.OBBBBO.',
  '.OBBBBO.',
  '..OOOO..',
  '........',
];
const BALL = imageOf(BALL_ROWS);

const SHADE_BALL = {
  id: 'shade-ball',
  title: 'Shade a ball',
  technique: 'shading',
  instruction: 'Shade this ball lit from the top left.',
  roles: { '#111111': 'outline', '#3366CC': 'base', '#1a3366': 'shadow', '#99bbff': 'highlight' },
  checks: ['shadow-away-from-light', 'highlight-toward-light'],
  light: 'top-left',
};

const TECHNIQUES = { shading: 'ball-lesson', outline: 'ball-lesson', tiling: 'tile-lesson' };
const COURSE = ['ball-lesson', 'tile-lesson'];

const read = (manifest: unknown, start = BALL, techniques: unknown = TECHNIQUES) =>
  readTechniqueDrills({ techniques, course: COURSE, drills: [{ manifest, start }] });

describe('reading Technique Drills from repo content', () => {
  it('builds the drill from its starting sprite, manifest and the Lesson that teaches it', () => {
    const reading = read(SHADE_BALL);
    if (!reading.ok) throw new Error(reading.problem);
    const [drill] = reading.drills;
    expect(drill).toMatchObject({
      id: 'shade-ball',
      title: 'Shade a ball',
      technique: 'shading',
      lessonId: 'ball-lesson',
      instruction: 'Shade this ball lit from the top left.',
      checks: ['shadow-away-from-light', 'highlight-toward-light'],
      light: 'top-left',
      seamless: [],
    });
    expect(drill!.start.palette).toEqual(['#111111', '#3366cc', '#1a3366', '#99bbff']);
    expect(drill!.roles).toEqual(['outline', 'base', 'shadow', 'highlight']);
    expect(drill!.start.pixels.filter((p) => p === 1)).toHaveLength(16);
    expect(drill!.start.pixels.filter((p) => p > 1)).toHaveLength(0);
  });

  it('reads the edges a tiling drill must repeat across', () => {
    const reading = read({
      ...SHADE_BALL,
      technique: 'tiling',
      checks: ['seamless'],
      light: undefined,
      seamless: ['left-right'],
    });
    if (!reading.ok) throw new Error(reading.problem);
    expect(reading.drills[0]).toMatchObject({ lessonId: 'tile-lesson', seamless: ['left-right'] });
    expect(reading.drills[0]!.light).toBeUndefined();
  });

  it.each([
    ['a manifest that is not an object', [], /not a Technique Drill manifest/],
    ['a missing title', { ...SHADE_BALL, title: '' }, /title/],
    ['a missing instruction', { ...SHADE_BALL, instruction: 4 }, /instruction/],
    ['an unknown technique', { ...SHADE_BALL, technique: 'juggling' }, /technique/],
    [
      'a sprite color with no Role',
      { ...SHADE_BALL, roles: { '#3366cc': 'base' } },
      /#111111 .* has no Role/,
    ],
    ['an unknown Role', { ...SHADE_BALL, roles: { ...SHADE_BALL.roles, '#111111': 'rim' } }, /rim/],
    ['no checks', { ...SHADE_BALL, checks: [] }, /checks/],
    ['an unknown check', { ...SHADE_BALL, checks: ['sparkle'] }, /sparkle is not a check/],
    ['a light check with no light', { ...SHADE_BALL, light: undefined }, /needs a light/],
    [
      'a light with no light check',
      { ...SHADE_BALL, checks: ['closed-outline'] },
      /no light check/,
    ],
    [
      'a seamless check with no edges',
      { ...SHADE_BALL, checks: ['seamless'], light: undefined },
      /seamless edges/,
    ],
  ])('rejects %s', (_, manifest, problem) => {
    const reading = read(manifest);
    expect(reading.ok).toBe(false);
    if (!reading.ok) expect(reading.problem).toMatch(problem);
  });

  it('rejects a starting sprite that is not a Lesson size or is partly transparent', () => {
    const wide = imageOf(['OOOOOOOOOOOO', ...Array.from({ length: 7 }, () => '............')]);
    const faded = imageOf(BALL_ROWS.map((row, y) => (y === 3 ? row.replace('B', '~') : row)));
    expect(read(SHADE_BALL, wide)).toMatchObject({ ok: false, problem: /12x8/ });
    expect(read(SHADE_BALL, faded)).toMatchObject({ ok: false, problem: /partly transparent/ });
  });

  it('rejects a technique taught by a Lesson that is not in the Course', () => {
    expect(
      readTechniqueDrills({
        techniques: TECHNIQUES,
        course: ['tile-lesson'],
        drills: [{ manifest: SHADE_BALL, start: BALL }],
      }),
    ).toMatchObject({
      ok: false,
      problem: /ball-lesson, which teaches \w+, is not in the Course/,
    });
  });

  it('rejects a technique no Lesson teaches, or two drills with one id', () => {
    expect(read(SHADE_BALL, BALL, { outline: 'ball-lesson' })).toMatchObject({
      ok: false,
      problem: /No Lesson teaches the shading technique/,
    });
    expect(
      readTechniqueDrills({
        techniques: TECHNIQUES,
        course: COURSE,
        drills: [
          { manifest: SHADE_BALL, start: BALL },
          { manifest: SHADE_BALL, start: BALL },
        ],
      }),
    ).toMatchObject({ ok: false, problem: /Two drills have the id shade-ball/ });
  });
});
