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

const MANIFEST_FOR_FRAME = {
  id: 'frame',
  title: 'One Frame',
  roles: { '#111111': 'outline', '#CC3333': 'base', '#881111': 'shadow' },
  explanations: { silhouette: '', outline: '', base: '', shadow: '' },
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

describe('reading an animation Lesson from repo content', () => {
  const HOP_ROWS = [
    '........OOOO....................',
    '.......OBBBBO...................',
    '..OOOO..OOOO......OOOO..........',
    '.OBBSO..........OBBBBSO..OOOO...',
    '..OOOO...........OOOO...OBBSSO..',
    '.........................OOOO...',
    '................................',
    '................................',
  ];
  const strip = imageOf(HOP_ROWS);
  const ANIMATION = {
    id: 'hop',
    title: 'Hop',
    roles: MANIFEST.roles,
    animation: {
      fps: 6,
      steps: [
        { frame: 1, pose: 'key', explanation: 'Crouch.\n\n![Blocked in](examples/blocked.png)' },
        { frame: 3, pose: 'key', explanation: 'Stretch.' },
        { frame: 2, pose: 'in-between', explanation: 'Up.' },
        { frame: 4, pose: 'in-between', explanation: 'Down.' },
      ],
    },
  };
  const readAnimation = (manifest: unknown, reference = strip) =>
    readLesson({ manifest, reference, exampleSprites: ['examples/blocked.png'] });
  const frameOf = (rows: string[], frame: number) =>
    imageOf(rows.map((row) => row.slice(frame * 8, frame * 8 + 8)));

  it('cuts the Reference Sprite strip into square Frames, one Step each in manifest order', () => {
    const reading = readAnimation(ANIMATION);
    if (!reading.ok) throw new Error(reading.problem);
    const { lesson } = reading;
    expect([lesson.size, lesson.animation.fps, lesson.animation.frames.length]).toEqual([8, 6, 4]);
    expect(lesson.steps.map((s) => s.kind === 'frame' && [s.frame, s.pose, s.explanation])).toEqual(
      [
        [0, 'key', ANIMATION.animation.steps[0]!.explanation],
        [2, 'key', 'Stretch.'],
        [1, 'in-between', 'Up.'],
        [3, 'in-between', 'Down.'],
      ],
    );
    const third = readLesson({
      manifest: MANIFEST_FOR_FRAME,
      reference: frameOf(HOP_ROWS, 2),
      exampleSprites: [],
    });
    if (!third.ok) throw new Error(third.problem);
    const colorsOf = (pixels: readonly number[], palette: readonly string[]) =>
      pixels.map((p) => palette[p] ?? null);
    expect(colorsOf(lesson.animation.frames[2]!, lesson.palette)).toEqual(
      colorsOf(third.lesson.reference.pixels, third.lesson.palette),
    );
  });

  it.each([
    [
      'explanations as well as animation Steps',
      { ...ANIMATION, explanations: MANIFEST.explanations },
      /either explanations, an animation or a tileset/,
    ],
    [
      'an FPS out of range',
      { ...ANIMATION, animation: { ...ANIMATION.animation, fps: 0 } },
      /0 FPS/,
    ],
    [
      'a pose that is not key or in-between',
      {
        ...ANIMATION,
        animation: {
          ...ANIMATION.animation,
          steps: [
            { ...ANIMATION.animation.steps[0], pose: 'hold' },
            ...ANIMATION.animation.steps.slice(1),
          ],
        },
      },
      /hold is not a pose/,
    ],
    [
      'a Frame counted from 0',
      {
        ...ANIMATION,
        animation: {
          ...ANIMATION.animation,
          steps: [
            { ...ANIMATION.animation.steps[0], frame: 0 },
            ...ANIMATION.animation.steps.slice(1),
          ],
        },
      },
      /no Frame 0/,
    ],
    [
      'an Example Sprite that is not shipped',
      {
        ...ANIMATION,
        animation: {
          ...ANIMATION.animation,
          steps: [
            { ...ANIMATION.animation.steps[0], explanation: '![x](examples/nope.png)' },
            ...ANIMATION.animation.steps.slice(1),
          ],
        },
      },
      /examples\/nope.png/,
    ],
  ])('rejects %s', (_, manifest, problem) => {
    const reading = readAnimation(manifest);
    expect(reading.ok || reading.problem).toMatch(problem);
  });

  it('rejects a strip that does not divide into square Frames', () => {
    const ragged = imageOf(HOP_ROWS.map((row) => row.slice(0, 28)));
    const reading = readAnimation(ANIMATION, ragged);
    expect(reading.ok || reading.problem).toMatch(/28x8/);
  });
});

describe('reading a tileset Lesson from repo content', () => {
  const GROUND = Array.from({ length: 16 }, (_, y) =>
    y === 5 ? 'BBBBBBSBBBBBBBBB' : 'B'.repeat(16),
  );
  const EDGE = Array.from({ length: 16 }, (_, y) => (y < 4 ? 'O'.repeat(16) : 'B'.repeat(16)));
  const strip = imageOf(GROUND.map((row, y) => row + EDGE[y]));
  const TILESET = {
    id: 'path',
    title: 'Path',
    roles: MANIFEST.roles,
    tileset: {
      tiles: [
        {
          name: 'Ground',
          seamless: ['left-right', 'top-bottom'],
          explanation: 'Fill.\n\n![Blocked in](examples/blocked.png)',
        },
        { name: 'Top edge', seamless: ['left-right'], explanation: 'Edge.' },
      ],
    },
  };
  const readTileset = (manifest: unknown, reference = strip) =>
    readLesson({ manifest, reference, exampleSprites: ['examples/blocked.png'] });

  it('cuts the strip into 16x16 tiles, one Step each in strip order', () => {
    const reading = readTileset(TILESET);
    if (!reading.ok) throw new Error(reading.problem);
    const { lesson } = reading;
    expect([lesson.size, lesson.animation.frames.length]).toEqual([16, 2]);
    expect(
      lesson.steps.map((s) => s.kind === 'tile' && [s.tile, s.name, s.seamless, s.explanation]),
    ).toEqual([
      [0, 'Ground', ['left-right', 'top-bottom'], TILESET.tileset.tiles[0]!.explanation],
      [1, 'Top edge', ['left-right'], 'Edge.'],
    ]);
    expect(lesson.steps[1]!.target.slice(0, 16).map((p) => lesson.palette[p])).toEqual(
      Array(16).fill('#111111'),
    );
  });

  const withTiles = (tiles: unknown[]) => ({ ...TILESET, tileset: { tiles } });
  const [ground, edge] = TILESET.tileset.tiles;

  it.each([
    [
      'tiles that are not 16x16',
      TILESET,
      imageOf(['OOOOOOOO', ...Array<string>(6).fill('BBBBBBBB'), 'SSSSSSSS']),
      /16x16 tiles, not 8x8/,
    ],
    ['a tile with no Step', withTiles([ground]), strip, /2 tiles but 1 tile Steps/],
    [
      'a tile with no name',
      withTiles([ground, { ...edge, name: ' ' }]),
      strip,
      /Tile 2 needs a name/,
    ],
    [
      'an edge pair that is not left-right or top-bottom',
      withTiles([ground, { ...edge, seamless: ['diagonal'] }]),
      strip,
      /diagonal is not an edge pair/,
    ],
    [
      'an Example Sprite that is not shipped',
      withTiles([ground, { ...edge, explanation: '![x](examples/nope.png)' }]),
      strip,
      /examples\/nope.png/,
    ],
    [
      'an animation as well as a tileset',
      { ...TILESET, animation: { fps: 6, steps: [] } },
      strip,
      /either explanations, an animation or a tileset/,
    ],
  ])('rejects %s', (_, manifest, reference, problem) => {
    const reading = readTileset(manifest, reference);
    expect(reading.ok || reading.problem).toMatch(problem);
  });
});
