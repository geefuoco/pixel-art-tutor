import type { Animation } from './animation';
import { TRANSPARENT, type Color, type Drawing } from './drawing';
import {
  createAnimationLesson,
  createLesson,
  isFramePose,
  isRole,
  STEP_KINDS,
  type FrameStepContent,
  type Lesson,
  type Role,
  type StepKind,
} from './lesson';
import { imagesIn, parseMarkdown } from './markdown';
import { drawingFromImage, hasPartlyTransparentPixel, type RgbaImage } from './png';

export type LessonReading =
  { readonly ok: true; readonly lesson: Lesson } | { readonly ok: false; readonly problem: string };

class ManifestProblem extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStepKind(value: string): value is StepKind {
  return (STEP_KINDS as readonly string[]).includes(value);
}

function requireText(manifest: Record<string, unknown>, key: string): string {
  const value = manifest[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ManifestProblem(`The manifest needs a ${key}`);
  }
  return value;
}

function readRoles(value: unknown, palette: readonly string[]): Role[] {
  if (!isRecord(value))
    throw new ManifestProblem('The manifest needs roles, mapping colors to Roles');
  const byColor = new Map<string, Role>();
  for (const [color, role] of Object.entries(value)) {
    if (!isRole(role)) throw new ManifestProblem(`${String(role)} is not a Role`);
    if (!palette.includes(color.toLowerCase())) {
      throw new ManifestProblem(`${color} is not in the Reference Sprite`);
    }
    byColor.set(color.toLowerCase(), role);
  }
  return palette.map((color) => {
    const role = byColor.get(color);
    if (!role) throw new ManifestProblem(`${color} has no Role`);
    return role;
  });
}

function checkExampleSprites(kind: string, text: string, exampleSprites: readonly string[]) {
  for (const { src } of imagesIn(parseMarkdown(text))) {
    if (!exampleSprites.includes(src)) {
      throw new ManifestProblem(`The ${kind} explanation shows ${src}, which is not shipped`);
    }
  }
}

function readExplanations(
  value: unknown,
  exampleSprites: readonly string[],
): Partial<Record<StepKind, string>> {
  if (!isRecord(value)) throw new ManifestProblem('The manifest needs explanations');
  const explanations: Partial<Record<StepKind, string>> = {};
  for (const [kind, text] of Object.entries(value)) {
    if (text === undefined) continue;
    if (!isStepKind(kind)) throw new ManifestProblem(`${kind} is not a Step`);
    if (typeof text !== 'string') throw new ManifestProblem(`The ${kind} explanation is not text`);
    checkExampleSprites(kind, text, exampleSprites);
    explanations[kind] = text;
  }
  return explanations;
}

function readSilhouetteColor(value: unknown, palette: readonly string[]): number | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ManifestProblem('The manifest overrides are not an object');
  for (const key of Object.keys(value)) {
    if (key !== 'silhouetteColor') throw new ManifestProblem(`${key} is not an override`);
  }
  const color = value.silhouetteColor;
  if (color === undefined) return undefined;
  const index = typeof color === 'string' ? palette.indexOf(color.toLowerCase()) : -1;
  if (index < 0) {
    throw new ManifestProblem(
      `The silhouette color ${String(color)} is not in the Reference Sprite`,
    );
  }
  return index;
}

function frameImage(strip: RgbaImage, frame: number): RgbaImage {
  const size = strip.height;
  const data: number[] = [];
  for (let y = 0; y < size; y++) {
    const start = (y * strip.width + frame * size) * 4;
    for (let i = start; i < start + size * 4; i++) data.push(strip.data[i]!);
  }
  return { width: size, height: size, data };
}

function animationFromStrip(strip: RgbaImage, fps: number): Animation {
  const size = strip.height;
  if (size === 0 || strip.width % size !== 0) {
    throw new ManifestProblem(
      `An animation Reference Sprite is a strip of square Frames, not ${strip.width}x${strip.height}`,
    );
  }
  const drawings: Drawing[] = Array.from({ length: strip.width / size }, (_, frame) =>
    drawingFromImage(frameImage(strip, frame)),
  );
  const palette: Color[] = [];
  const frames = drawings.map(({ palette: own, pixels }) =>
    pixels.map((p) => {
      if (p === TRANSPARENT) return p;
      const color = own[p]!;
      const index = palette.indexOf(color);
      return index >= 0 ? index : palette.push(color) - 1;
    }),
  );
  return { width: size, height: size, palette, frames, fps };
}

function readFrameSteps(value: unknown, exampleSprites: readonly string[]): FrameStepContent[] {
  if (!Array.isArray(value)) throw new ManifestProblem('The animation needs a list of Steps');
  return value.map((step: unknown, i) => {
    if (!isRecord(step)) throw new ManifestProblem(`Animation Step ${i + 1} is not an object`);
    const { frame, pose, explanation } = step;
    if (!Number.isInteger(frame)) {
      throw new ManifestProblem(`Animation Step ${i + 1} needs a Frame number`);
    }
    if (!isFramePose(pose)) {
      throw new ManifestProblem(`${String(pose)} is not a pose: use key or in-between`);
    }
    if (typeof explanation !== 'string') {
      throw new ManifestProblem(`Animation Step ${i + 1} needs an explanation`);
    }
    checkExampleSprites(`Frame ${String(frame)}`, explanation, exampleSprites);
    return { frame: (frame as number) - 1, pose, explanation };
  });
}

function readAnimationLesson(
  manifest: Record<string, unknown>,
  image: RgbaImage,
  exampleSprites: readonly string[],
): Lesson {
  if (manifest.explanations !== undefined || manifest.overrides !== undefined) {
    throw new ManifestProblem(
      'A manifest has either explanations or an animation, and overrides only go with explanations',
    );
  }
  const { animation } = manifest;
  if (!isRecord(animation)) throw new ManifestProblem('The manifest animation is not an object');
  const fps = typeof animation.fps === 'number' ? animation.fps : NaN;
  const reference = animationFromStrip(image, fps);
  return createAnimationLesson({
    id: requireText(manifest, 'id'),
    title: requireText(manifest, 'title'),
    animation: reference,
    roles: readRoles(manifest.roles, reference.palette),
    frameSteps: readFrameSteps(animation.steps, exampleSprites),
  });
}

export function readLesson(content: {
  manifest: unknown;
  reference: RgbaImage;
  exampleSprites: readonly string[];
}): LessonReading {
  const { manifest, reference: image, exampleSprites } = content;
  try {
    if (!isRecord(manifest)) throw new ManifestProblem('This is not a Lesson manifest');
    if (hasPartlyTransparentPixel(image)) {
      throw new ManifestProblem('The Reference Sprite has partly transparent pixels');
    }
    if (manifest.animation !== undefined) {
      return { ok: true, lesson: readAnimationLesson(manifest, image, exampleSprites) };
    }
    const reference = drawingFromImage(image);
    const lesson = createLesson({
      id: requireText(manifest, 'id'),
      title: requireText(manifest, 'title'),
      reference,
      roles: readRoles(manifest.roles, reference.palette),
      explanations: readExplanations(manifest.explanations, exampleSprites),
      silhouetteColor: readSilhouetteColor(manifest.overrides, reference.palette),
    });
    return { ok: true, lesson };
  } catch (error) {
    if (error instanceof ManifestProblem || error instanceof RangeError) {
      return { ok: false, problem: error.message };
    }
    throw error;
  }
}
