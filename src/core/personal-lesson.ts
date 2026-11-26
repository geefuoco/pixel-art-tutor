import { hueAndChroma, lightness } from './color';
import { enlargeCanvas, TRANSPARENT, type Drawing } from './drawing';
import {
  createLesson,
  deriveSteps,
  LESSON_SIZES,
  type Lesson,
  type Role,
  type StepKind,
} from './lesson';
import { drawingFromImage, hasPartlyTransparentPixel, type RgbaImage } from './png';
import { ROLE_GREY_MAX_CHROMA, ROLE_HUE_GROUP_DEGREES } from './thresholds';

export const MAX_PERSONAL_LESSON_SIZE = Math.max(...LESSON_SIZES);
export const MAX_PERSONAL_LESSON_COLORS = 32;

export type UploadReading =
  | { readonly ok: true; readonly reference: Drawing }
  | { readonly ok: false; readonly problem: string };

function sizeOrTransparencyProblem(image: RgbaImage): string | null {
  const { width, height } = image;
  if (width > MAX_PERSONAL_LESSON_SIZE || height > MAX_PERSONAL_LESSON_SIZE) {
    return `This image is ${width}x${height} pixels. A Personal Lesson can be up to ${MAX_PERSONAL_LESSON_SIZE}x${MAX_PERSONAL_LESSON_SIZE}.`;
  }
  if (hasPartlyTransparentPixel(image)) {
    return 'This image has partly transparent pixels. Every pixel must be fully opaque or fully transparent.';
  }
  return null;
}

export function readUpload(image: RgbaImage): UploadReading {
  const problem = sizeOrTransparencyProblem(image);
  if (problem) return { ok: false, problem };
  const drawing = drawingFromImage(image);
  if (drawing.pixels.every((p) => p === TRANSPARENT)) {
    return {
      ok: false,
      problem: 'This image is fully transparent, so there is nothing to learn from.',
    };
  }
  if (drawing.palette.length > MAX_PERSONAL_LESSON_COLORS) {
    return {
      ok: false,
      problem: `This image has ${drawing.palette.length} colors. A Personal Lesson can have up to ${MAX_PERSONAL_LESSON_COLORS}.`,
    };
  }
  const size = LESSON_SIZES.find((s) => s >= Math.max(drawing.width, drawing.height))!;
  return { ok: true, reference: enlargeCanvas(drawing, size) };
}

function mostCommon(colors: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = colors[0]!;
  for (const [color, count] of counts) {
    if (count > counts.get(best)! || (count === counts.get(best)! && color < best)) best = color;
  }
  return best;
}

function edgeColors(sprite: Drawing): number[] {
  const { width, height, pixels } = sprite;
  const clearAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height || pixels[y * width + x] === TRANSPARENT;
  return pixels.filter((p, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return (
      p !== TRANSPARENT &&
      (clearAt(x - 1, y) || clearAt(x + 1, y) || clearAt(x, y - 1) || clearAt(x, y + 1))
    );
  });
}

function isGrey(sprite: Drawing, color: number): boolean {
  return hueAndChroma(sprite.palette[color]!).chroma < ROLE_GREY_MAX_CHROMA;
}

function hueGroups(sprite: Drawing, colors: readonly number[]): number[][] {
  const hued = colors
    .map((color) => ({ color, hue: hueAndChroma(sprite.palette[color]!).hue }))
    .sort((a, b) => a.hue - b.hue);
  const splitsAfter = (i: number) =>
    (hued[(i + 1) % hued.length]!.hue - hued[i]!.hue + 360) % 360 > ROLE_HUE_GROUP_DEGREES;
  const start = hued.findIndex((_, i) => splitsAfter(i));
  const groups: number[][] = [];
  let group: number[] = [];
  for (let k = 1; k <= hued.length; k++) {
    const i = (start + k) % hued.length;
    group.push(hued[i]!.color);
    if (splitsAfter(i) || k === hued.length) {
      groups.push(group);
      group = [];
    }
  }
  return groups;
}

function neighbourCounts(sprite: Drawing, color: number, ignored: number | undefined) {
  const { width, height, pixels } = sprite;
  const counts = new Map<number, number>();
  pixels.forEach((p, i) => {
    if (p !== color) return;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = pixels[ny * width + nx]!;
      if (n === TRANSPARENT || n === color || n === ignored) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  });
  return counts;
}

function groupsWithGreys(sprite: Drawing, colors: readonly number[], outline?: number) {
  const greys = colors.filter((c) => isGrey(sprite, c));
  const groups = hueGroups(
    sprite,
    colors.filter((c) => !isGrey(sprite, c)),
  );
  const greyGroup: number[] = [];
  for (const grey of greys) {
    let touchesGrey = 0;
    let touchesHued = 0;
    let mostTouched: number | undefined;
    let mostTouches = 0;
    for (const [n, count] of neighbourCounts(sprite, grey, outline)) {
      if (isGrey(sprite, n)) {
        touchesGrey += count;
        continue;
      }
      touchesHued += count;
      if (count > mostTouches) {
        mostTouched = n;
        mostTouches = count;
      }
    }
    const accentOf =
      touchesHued > touchesGrey ? groups.find((g) => g.includes(mostTouched!)) : undefined;
    if (accentOf) accentOf.push(grey);
    else greyGroup.push(grey);
  }
  return greyGroup.length > 0 ? [...groups, greyGroup] : groups;
}

export function proposeRoles(sprite: Drawing): Role[] {
  const opaque = sprite.pixels.filter((p) => p !== TRANSPARENT);
  const used = [...new Set(opaque)];
  const roles: Role[] = sprite.palette.map(() => 'base');
  const outline = used.length > 1 ? mostCommon(edgeColors(sprite)) : undefined;
  if (outline !== undefined) roles[outline] = 'outline';
  const others = used.filter((c) => c !== outline);
  for (const group of groupsWithGreys(sprite, others, outline)) {
    const base = mostCommon(opaque.filter((p) => group.includes(p)));
    const baseLightness = lightness(sprite.palette[base]!);
    for (const color of group) {
      if (color === base) continue;
      roles[color] = lightness(sprite.palette[color]!) > baseLightness ? 'highlight' : 'shadow';
    }
  }
  return roles;
}

export interface LessonManifest {
  readonly id: string;
  readonly title: string;
  readonly roles: Readonly<Record<string, Role>>;
  readonly explanations: Partial<Record<StepKind, string>>;
}

function folderNameOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'personal-lesson';
}

export function personalLessonManifest(lesson: Lesson): LessonManifest {
  return {
    id: folderNameOf(lesson.title),
    title: lesson.title,
    roles: Object.fromEntries(lesson.palette.map((color, i) => [color, lesson.roles[i]!])),
    explanations: Object.fromEntries(lesson.steps.map((s) => [s.kind, s.explanation])),
  };
}

function colorCountPhrase(count: number, role: Role): string {
  return `${count} ${role} ${count === 1 ? 'color' : 'colors'}`;
}

const EXPLANATION_TEMPLATES: Record<StepKind, (count: number) => string> = {
  silhouette: () =>
    'Every sprite starts as a shape. Block in the whole sprite in one flat color and leave the detail for later. If the silhouette reads well on its own, the finished sprite will too.',
  outline: (n) =>
    `Draw the outline over the edge of the silhouette, using ${colorCountPhrase(n, 'outline')}. Keep it **1 pixel wide**: where the line steps diagonally, pixels touch only at their corners.`,
  base: (n) =>
    `Base colors are the flat middle tones of each part of the sprite. This sprite has ${colorCountPhrase(n, 'base')}.`,
  shadow: (n) =>
    `Shadow goes on the sides that face away from the light. It is a darker version of a base color, not black. This sprite uses ${colorCountPhrase(n, 'shadow')}.`,
  highlight: (n) =>
    `Highlights are the brightest colors, used sparingly where the light hits hardest. This sprite uses ${colorCountPhrase(n, 'highlight')}.`,
};

export function createPersonalLesson(options: {
  id: string;
  title: string;
  reference: Drawing;
  roles: readonly Role[];
}): Lesson {
  const { reference, roles } = options;
  const used = new Set(reference.pixels.filter((p) => p !== TRANSPARENT));
  const explanations = Object.fromEntries(
    deriveSteps(reference, roles).map(({ kind }) => [
      kind,
      EXPLANATION_TEMPLATES[kind]([...used].filter((c) => roles[c] === kind).length),
    ]),
  );
  return createLesson({ ...options, explanations });
}
