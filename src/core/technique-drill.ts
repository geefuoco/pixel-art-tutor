import type { Color, Drawing } from './drawing';
import { isLessonSize, isRole, type Role } from './lesson';
import { drawingFromImage, hasPartlyTransparentPixel, type RgbaImage } from './png';
import { isEdgePair, type EdgePair } from './tiling';

export const TECHNIQUES = ['outline', 'shading', 'tiling'] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const DRILL_CHECKS = [
  'closed-outline',
  'clean-outline',
  'shadow-away-from-light',
  'highlight-toward-light',
  'seamless',
] as const;
export type DrillCheck = (typeof DRILL_CHECKS)[number];

const LIGHT_CHECKS: readonly DrillCheck[] = ['shadow-away-from-light', 'highlight-toward-light'];

export const LIGHT_DIRECTIONS = ['top-left', 'top-right', 'above', 'left', 'right'] as const;
export type LightDirection = (typeof LIGHT_DIRECTIONS)[number];

export interface TechniqueDrill {
  readonly id: string;
  readonly title: string;
  readonly technique: Technique;
  readonly lessonId: string;
  readonly instruction: string;
  readonly start: Drawing;
  readonly roles: readonly Role[];
  readonly checks: readonly DrillCheck[];
  readonly light?: LightDirection;
  readonly seamless: readonly EdgePair[];
}

export interface DrillContent {
  readonly manifest: unknown;
  readonly start: RgbaImage;
}

export type TechniqueDrillsReading =
  | { readonly ok: true; readonly drills: readonly TechniqueDrill[] }
  | { readonly ok: false; readonly problem: string };

class DrillProblem extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}

function requireText(manifest: Record<string, unknown>, key: string, drill: string): string {
  const value = manifest[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DrillProblem(`The drill ${drill} needs a ${key}`);
  }
  return value;
}

function readTechniqueLessons(
  value: unknown,
  course: readonly string[],
): ReadonlyMap<Technique, string> {
  if (!isRecord(value)) {
    throw new DrillProblem('techniques.json maps each technique to the Lesson that teaches it');
  }
  const lessons = new Map<Technique, string>();
  for (const [technique, lessonId] of Object.entries(value)) {
    if (!isOneOf(TECHNIQUES, technique)) throw new DrillProblem(`${technique} is not a technique`);
    if (typeof lessonId !== 'string' || lessonId.trim() === '') {
      throw new DrillProblem(`The ${technique} technique needs a Lesson id`);
    }
    if (!course.includes(lessonId)) {
      throw new DrillProblem(`${lessonId}, which teaches ${technique}, is not in the Course`);
    }
    lessons.set(technique, lessonId);
  }
  return lessons;
}

function readPalette(
  value: unknown,
  start: Drawing,
  drill: string,
): { palette: Color[]; roles: Role[] } {
  if (!isRecord(value)) throw new DrillProblem(`The drill ${drill} needs roles`);
  const byColor = new Map<Color, Role>();
  for (const [color, role] of Object.entries(value)) {
    if (!isRole(role)) throw new DrillProblem(`${String(role)} is not a Role`);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new DrillProblem(`${color} is not a color`);
    byColor.set(color.toLowerCase(), role);
  }
  const palette = [
    ...start.palette,
    ...[...byColor.keys()].filter((c) => !start.palette.includes(c)),
  ];
  const roles = palette.map((color) => {
    const role = byColor.get(color);
    if (!role) throw new DrillProblem(`${color} in the drill ${drill} has no Role`);
    return role;
  });
  return { palette, roles };
}

function readChecks(value: unknown, drill: string): DrillCheck[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DrillProblem(`The drill ${drill} needs a list of checks`);
  }
  return value.map((check: unknown) => {
    if (!isOneOf(DRILL_CHECKS, check)) throw new DrillProblem(`${String(check)} is not a check`);
    return check;
  });
}

function readLight(value: unknown, checks: readonly DrillCheck[], drill: string) {
  const needed = checks.some((check) => LIGHT_CHECKS.includes(check));
  if (!needed && value === undefined) return undefined;
  if (!needed) throw new DrillProblem(`The drill ${drill} has a light but no light check`);
  if (!isOneOf(LIGHT_DIRECTIONS, value)) {
    throw new DrillProblem(`The drill ${drill} needs a light: ${LIGHT_DIRECTIONS.join(', ')}`);
  }
  return value;
}

function readSeamless(value: unknown, checks: readonly DrillCheck[], drill: string): EdgePair[] {
  const needed = checks.includes('seamless');
  if (!needed && value === undefined) return [];
  if (!needed)
    throw new DrillProblem(`The drill ${drill} has seamless edges but no seamless check`);
  if (!Array.isArray(value) || value.length === 0 || !value.every(isEdgePair)) {
    throw new DrillProblem(`The drill ${drill} needs seamless edges: left-right, top-bottom`);
  }
  return value;
}

function readStart(image: RgbaImage, drill: string): Drawing {
  if (hasPartlyTransparentPixel(image)) {
    throw new DrillProblem(`The starting sprite of ${drill} has partly transparent pixels`);
  }
  if (image.width !== image.height || !isLessonSize(image.width)) {
    throw new DrillProblem(
      `The starting sprite of ${drill} is 8x8, 16x16 or 32x32, not ${image.width}x${image.height}`,
    );
  }
  return drawingFromImage(image);
}

function readDrill(
  { manifest, start: image }: DrillContent,
  lessons: ReadonlyMap<Technique, string>,
): TechniqueDrill {
  if (!isRecord(manifest)) throw new DrillProblem('This is not a Technique Drill manifest');
  const id = requireText(manifest, 'id', 'with no id');
  const { technique } = manifest;
  if (!isOneOf(TECHNIQUES, technique)) {
    throw new DrillProblem(`The drill ${id} needs a technique: ${TECHNIQUES.join(', ')}`);
  }
  const lessonId = lessons.get(technique);
  if (!lessonId) throw new DrillProblem(`No Lesson teaches the ${technique} technique`);
  const sprite = readStart(image, id);
  const { palette, roles } = readPalette(manifest.roles, sprite, id);
  const checks = readChecks(manifest.checks, id);
  const light = readLight(manifest.light, checks, id);
  return {
    id,
    title: requireText(manifest, 'title', id),
    technique,
    lessonId,
    instruction: requireText(manifest, 'instruction', id),
    start: { ...sprite, palette },
    roles,
    checks,
    ...(light ? { light } : {}),
    seamless: readSeamless(manifest.seamless, checks, id),
  };
}

export function readTechniqueDrills(content: {
  techniques: unknown;
  course: readonly string[];
  drills: readonly DrillContent[];
}): TechniqueDrillsReading {
  try {
    const lessons = readTechniqueLessons(content.techniques, content.course);
    const drills = content.drills.map((drill) => readDrill(drill, lessons));
    const ids = drills.map((drill) => drill.id);
    const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repeated) throw new DrillProblem(`Two drills have the id ${repeated}`);
    return { ok: true, drills };
  } catch (error) {
    if (error instanceof DrillProblem) return { ok: false, problem: error.message };
    throw error;
  }
}

export function techniqueDrillText(drill: TechniqueDrill): string {
  return `Technique Drill: ${drill.title}`;
}
