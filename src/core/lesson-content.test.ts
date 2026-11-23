import { describe, expect, it } from 'vitest';
import { readLesson } from './lesson-content';
import type { RgbaImage } from './png';

const COLORS: Record<string, number[]> = {
  O: [0x11, 0x11, 0x11, 255],
  B: [0xcc, 0x33, 0x33, 255],
  S: [0x88, 0x11, 0x11, 255],
  '.': [0, 0, 0, 0],
  '~': [0xcc, 0x33, 0x33, 128],
};

function imageOf(rows: string[]): RgbaImage {
  return {
    width: rows[0]!.length,
    height: rows.length,
    data: rows.flatMap((row) => [...row].flatMap((c) => COLORS[c]!)),
  };
}

const POT_ROWS = [
  '........',
  '..OOOO..',
  '.OBBBSO.',
  '.OBBSSO.',
  '..OOOO..',
  '........',
  '........',
  '........',
];
const POT = imageOf(POT_ROWS);

const MANIFEST = {
  id: 'pot',
  title: 'A pot',
  roles: { '#111111': 'outline', '#CC3333': 'base', '#881111': 'shadow' },
  explanations: {
    silhouette: 'Block it in.\n\n![Blocked in](examples/blocked.png)',
    outline: 'Outline it.',
    base: 'Base colors.',
    shadow: 'Shade it.',
  },
};

const read = (manifest: unknown, reference = POT, exampleSprites = ['examples/blocked.png']) =>
  readLesson({ manifest, reference, exampleSprites });

describe('reading a Lesson from repo content', () => {
  it('builds the Lesson from the Reference Sprite and its manifest', () => {
    const reading = read(MANIFEST);
    if (!reading.ok) throw new Error(reading.problem);
    const { lesson } = reading;
    expect([lesson.id, lesson.title, lesson.size]).toEqual(['pot', 'A pot', 8]);
    expect(lesson.palette).toEqual(['#111111', '#cc3333', '#881111']);
    expect(lesson.roles).toEqual(['outline', 'base', 'shadow']);
    expect(lesson.steps.map((s) => s.kind)).toEqual(['silhouette', 'outline', 'base', 'shadow']);
    expect(lesson.steps[0]!.explanation).toBe(MANIFEST.explanations.silhouette);
    expect(lesson.steps[0]!.target.filter((p) => p === 1)).toHaveLength(20);
  });

  it('lets the manifest override the silhouette color', () => {
    const reading = read({ ...MANIFEST, overrides: { silhouetteColor: '#111111' } });
    if (!reading.ok) throw new Error(reading.problem);
    expect(reading.lesson.steps[0]!.target.filter((p) => p === 0)).toHaveLength(20);
  });

  it.each([
    ['a manifest that is not an object', [], /not a Lesson manifest/],
    ['a missing id', { ...MANIFEST, id: '' }, /id/],
    ['a missing title', { ...MANIFEST, title: 3 }, /title/],
    [
      'a sprite color with no Role',
      { ...MANIFEST, roles: { '#111111': 'outline', '#cc3333': 'base' } },
      /#881111 has no Role/,
    ],
    [
      'a Role for a color the sprite lacks',
      { ...MANIFEST, roles: { ...MANIFEST.roles, '#ffffff': 'base' } },
      /#ffffff is not in the Reference Sprite/,
    ],
    [
      'an unknown Role',
      { ...MANIFEST, roles: { ...MANIFEST.roles, '#881111': 'glow' } },
      /glow is not a Role/,
    ],
    [
      'a Step with no explanation',
      { ...MANIFEST, explanations: { ...MANIFEST.explanations, shadow: undefined } },
      /shadow Step needs an explanation/,
    ],
    [
      'an explanation for a Step the sprite lacks',
      { ...MANIFEST, explanations: { ...MANIFEST.explanations, highlight: 'Shine.' } },
      /highlight/,
    ],
    [
      'an Example Sprite that is not shipped',
      {
        ...MANIFEST,
        explanations: { ...MANIFEST.explanations, outline: '![x](examples/nope.png)' },
      },
      /examples\/nope.png/,
    ],
    [
      'a silhouette color the sprite lacks',
      { ...MANIFEST, overrides: { silhouetteColor: '#ffffff' } },
      /#ffffff/,
    ],
    ['an unknown override', { ...MANIFEST, overrides: { speed: 2 } }, /speed/],
  ])('rejects %s', (_, manifest, problem) => {
    const reading = read(manifest);
    expect(reading.ok).toBe(false);
    if (!reading.ok) expect(reading.problem).toMatch(problem);
  });

  it('rejects a Reference Sprite that is not a Lesson size or has partly transparent pixels', () => {
    const wide = imageOf(POT_ROWS.map((row) => row + row));
    const wideReading = read(MANIFEST, wide);
    expect(wideReading.ok || wideReading.problem).toMatch(/16x8/);

    const soft = imageOf(['~' + POT_ROWS[0]!.slice(1), ...POT_ROWS.slice(1)]);
    const softReading = read(MANIFEST, soft);
    expect(softReading.ok || softReading.problem).toMatch(/partly transparent/);
  });
});
