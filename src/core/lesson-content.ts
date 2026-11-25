import { createLesson, isRole, STEP_KINDS, type Lesson, type Role, type StepKind } from './lesson';
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
    for (const { src } of imagesIn(parseMarkdown(text))) {
      if (!exampleSprites.includes(src)) {
        throw new ManifestProblem(`The ${kind} explanation shows ${src}, which is not shipped`);
      }
    }
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
