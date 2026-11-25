import { describe, expect, it } from 'vitest';
import type { Drawing } from './drawing';
import { readLesson } from './lesson-content';
import {
  createPersonalLesson,
  personalLessonManifest,
  proposeRoles,
  readUpload,
} from './personal-lesson';
import { spriteOf } from './test-grids';
import type { RgbaImage } from './png';

const RGBA: Record<string, number[]> = {
  '.': [0, 0, 0, 0],
  O: [0x22, 0x22, 0x44, 255],
  B: [0x33, 0x99, 0x33, 255],
  '~': [0x33, 0x99, 0x33, 100],
};

function imageOf(rows: readonly string[]): RgbaImage {
  return {
    width: rows[0]!.length,
    height: rows.length,
    data: rows.flatMap((row) => [...row].flatMap((c) => RGBA[c]!)),
  };
}

function solidImage(width: number, height: number, colorOf: (i: number) => number[]): RgbaImage {
  return {
    width,
    height,
    data: Array.from({ length: width * height }, (_, i) => colorOf(i)).flat(),
  };
}

describe('reading an uploaded sprite', () => {
  it('keeps the sprite, centred on the smallest Lesson canvas it fits', () => {
    const reading = readUpload(
      imageOf(['.O.', 'OBO', '.O.', '.O.', '.O.', '.O.', '.O.', '.O.', '.O.', '.O.']),
    );
    if (!reading.ok) throw new Error(reading.problem);
    const { reference } = reading;
    expect([reference.width, reference.height]).toEqual([16, 16]);
    expect(reference.palette).toEqual(['#222244', '#339933']);
    const row = (y: number) => reference.pixels.slice(y * 16, y * 16 + 16);
    const empty = new Array(16).fill(-1);
    expect(row(2)).toEqual(empty);
    expect(row(3).indexOf(0)).toBe(7);
    expect(row(4).slice(5, 10)).toEqual([-1, 0, 1, 0, -1]);
    expect(row(12).indexOf(0)).toBe(7);
    expect(row(13)).toEqual(empty);
  });

  it('takes an 8x8 sprite as it is', () => {
    const reading = readUpload(solidImage(8, 8, () => [1, 2, 3, 255]));
    if (!reading.ok) throw new Error(reading.problem);
    expect([reading.reference.width, reading.reference.height]).toEqual([8, 8]);
    expect(reading.reference.pixels.every((p) => p === 0)).toBe(true);
  });

  it.each([
    [
      'wider than 32 pixels',
      solidImage(33, 8, () => [1, 2, 3, 255]),
      'This image is 33x8 pixels. A Personal Lesson can be up to 32x32.',
    ],
    [
      'taller than 32 pixels',
      solidImage(4, 40, () => [1, 2, 3, 255]),
      'This image is 4x40 pixels. A Personal Lesson can be up to 32x32.',
    ],
    [
      'more than 32 colors',
      solidImage(8, 8, (i) => [i, 0, 0, 255]),
      'This image has 64 colors. A Personal Lesson can have up to 32.',
    ],
    [
      'partly transparent pixels',
      imageOf(['O~', 'BB']),
      'This image has partly transparent pixels. Every pixel must be fully opaque or fully transparent.',
    ],
    [
      'nothing drawn',
      imageOf(['..', '..']),
      'This image is fully transparent, so there is nothing to learn from.',
    ],
  ])('rejects an image with %s, saying why', (_, image, problem) => {
    expect(readUpload(image)).toEqual({ ok: false, problem });
  });
});

const JAR = spriteOf(
  ['.OOOOOO.', 'OPRRRRDO', 'ORRRRDDO', 'ORRRDDDO', 'OOOOOOOO', 'OGGGGLGO', 'OGGGGGGO', '.OOOOOO.'],
  'OPRDGL',
  ['#1a1a2e', '#ff8080', '#cc3333', '#881c1c', '#3366cc', '#88aaff'],
);

describe('proposing Roles for a sprite', () => {
  it('makes the color that dominates the edge the outline, and splits each hue into base, shadow and highlight', () => {
    const sprite = JAR;
    expect(proposeRoles(sprite)).toEqual([
      'outline',
      'highlight',
      'base',
      'shadow',
      'base',
      'highlight',
    ]);
  });

  it('keeps greys in a group of their own, apart from colored ones', () => {
    const palette = ['#222222', '#888888', '#555555', '#cccccc', '#8b5a2b', '#5c3a1a'];
    const sword = spriteOf(
      [
        '......OO',
        '.....OHO',
        '....OHBO',
        '...OHBO.',
        'O.OBBO..',
        'OOSBO...',
        '.OCOO...',
        'OWOO....',
      ],
      'OBSHCW',
      palette,
    );
    expect(proposeRoles(sword)).toEqual([
      'outline',
      'base',
      'shadow',
      'highlight',
      'base',
      'shadow',
    ]);
  });

  it('makes a lone white glint and a lone black shadow part of the colored group they touch', () => {
    const apple = spriteOf(['.OOOO.', 'ORWRRO', 'ORRRRO', 'ORRRKO', '.OOOO.', '......'], 'ORWK', [
      '#2b1a1a',
      '#cc3333',
      '#ffffff',
      '#000000',
    ]);
    expect(proposeRoles(apple)).toEqual(['outline', 'base', 'highlight', 'shadow']);
  });

  it('makes the only color of a one-color sprite its base', () => {
    const blob = spriteOf(['.BB.', 'BBBB', '.BB.', '....'], 'B', ['#336699']);
    expect(proposeRoles(blob)).toEqual(['base']);
  });
});

describe('a Personal Lesson', () => {
  const ROLES = ['outline', 'highlight', 'base', 'shadow', 'base', 'highlight'] as const;

  it('has a Step for each Role the sprite uses, each with a templated explanation', () => {
    const lesson = createPersonalLesson({ id: 'p-1', title: 'Jar', reference: JAR, roles: ROLES });
    expect([lesson.id, lesson.title, lesson.size]).toEqual(['p-1', 'Jar', 8]);
    expect(lesson.steps.map((s) => s.kind)).toEqual([
      'silhouette',
      'outline',
      'base',
      'shadow',
      'highlight',
    ]);
    const explanation = Object.fromEntries(lesson.steps.map((s) => [s.kind, s.explanation]));
    expect(explanation.silhouette).toMatch(/one flat color/);
    expect(explanation.outline).toMatch(/1 outline color\b/);
    expect(explanation.base).toMatch(/2 base colors/);
    expect(explanation.shadow).toMatch(/1 shadow color\b/);
    expect(explanation.highlight).toMatch(/2 highlight colors/);
  });

  it('follows overridden Roles, dropping the Step of a Role no color has any more', () => {
    const lesson = createPersonalLesson({
      id: 'p-1',
      title: 'Jar',
      reference: JAR,
      roles: ['outline', 'shadow', 'base', 'shadow', 'base', 'shadow'],
    });
    expect(lesson.steps.map((s) => s.kind)).toEqual(['silhouette', 'outline', 'base', 'shadow']);
    const shadow = lesson.steps.find((s) => s.kind === 'shadow')!;
    expect(shadow.target.filter((p) => p !== -1)).toHaveLength(8);
    expect(shadow.explanation).toMatch(/3 shadow colors/);
  });
});

function imageOfDrawing({ width, height, palette, pixels }: Drawing): RgbaImage {
  const rgba = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return {
    width,
    height,
    data: pixels.flatMap((p) => (p === -1 ? [0, 0, 0, 0] : [...rgba(palette[p]!), 255])),
  };
}

describe('the manifest of a Personal Lesson', () => {
  const lesson = createPersonalLesson({
    id: 'personal-1234',
    title: 'My Big Jar!',
    reference: JAR,
    roles: ['outline', 'highlight', 'base', 'shadow', 'base', 'highlight'],
  });

  it('is in the repo format, so the repo loader rebuilds the same Lesson from it', () => {
    const manifest: unknown = JSON.parse(JSON.stringify(personalLessonManifest(lesson)));
    const reading = readLesson({ manifest, reference: imageOfDrawing(JAR), exampleSprites: [] });
    if (!reading.ok) throw new Error(reading.problem);
    expect(reading.lesson).toEqual({ ...lesson, id: 'my-big-jar' });
  });

  it('maps each sprite color to its Role', () => {
    expect(personalLessonManifest(lesson).roles).toEqual({
      '#1a1a2e': 'outline',
      '#ff8080': 'highlight',
      '#cc3333': 'base',
      '#881c1c': 'shadow',
      '#3366cc': 'base',
      '#88aaff': 'highlight',
    });
  });

  it('takes its id from the title, as a folder name', () => {
    const titled = (title: string) => personalLessonManifest({ ...lesson, title }).id;
    expect(titled('  Ice Sword (v2) ')).toBe('ice-sword-v2');
    expect(titled('???')).toBe('personal-lesson');
  });
});
