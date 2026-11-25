import { frameDrawing, isValidFps, stillAnimation, type Animation } from './animation';
import { TRANSPARENT, type Color, type Drawing } from './drawing';
import type { EdgePair } from './tiling';

export const ROLES = ['outline', 'base', 'shadow', 'highlight'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return (ROLES as readonly unknown[]).includes(value);
}

export const STEP_KINDS = ['silhouette', ...ROLES] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const MODES = ['trace', 'hint', 'freehand'] as const;
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return (MODES as readonly unknown[]).includes(value);
}

export const LESSON_SIZES = [8, 16, 32] as const;
export type LessonSize = (typeof LESSON_SIZES)[number];

export interface StepTarget {
  readonly kind: StepKind;
  readonly target: readonly number[];
}

export const FRAME_POSES = ['key', 'in-between'] as const;
export type FramePose = (typeof FRAME_POSES)[number];

export function isFramePose(value: unknown): value is FramePose {
  return (FRAME_POSES as readonly unknown[]).includes(value);
}

export interface SpriteStep extends StepTarget {
  readonly explanation: string;
}

export interface FrameStep {
  readonly kind: 'frame';
  readonly frame: number;
  readonly pose: FramePose;
  readonly target: readonly number[];
  readonly explanation: string;
}

export const TILE_SIZE = 16;

export interface TileStep {
  readonly kind: 'tile';
  readonly tile: number;
  readonly name: string;
  readonly seamless: readonly EdgePair[];
  readonly target: readonly number[];
  readonly explanation: string;
}

export type LessonStep = SpriteStep | FrameStep | TileStep;

export function isAnimationLesson(lesson: Lesson): boolean {
  return lesson.steps.some((s) => s.kind === 'frame');
}

export function isTilesetLesson(lesson: Lesson): boolean {
  return lesson.steps.some((s) => s.kind === 'tile');
}

export function seamlessEdgesOfFrame(lesson: Lesson, frame: number): readonly EdgePair[] {
  const step = lesson.steps.find((s) => s.kind === 'tile' && s.tile === frame);
  return step?.kind === 'tile' ? step.seamless : [];
}

export function frameOfStep(step: LessonStep): number {
  if (step.kind === 'frame') return step.frame;
  if (step.kind === 'tile') return step.tile;
  return 0;
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly size: LessonSize;
  readonly palette: readonly Color[];
  readonly reference: Drawing;
  readonly animation: Animation;
  readonly roles: readonly Role[];
  readonly steps: readonly LessonStep[];
}

function mostUsedBaseColor(reference: Drawing, roles: readonly Role[]): number | undefined {
  const counts = new Map<number, number>();
  for (const p of reference.pixels) {
    if (p !== TRANSPARENT && roles[p] === 'base') counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: number | undefined;
  for (const [color, count] of [...counts].sort(([a], [b]) => a - b)) {
    if (best === undefined || count > counts.get(best)!) best = color;
  }
  return best;
}

export function deriveSteps(
  reference: Drawing,
  roles: readonly Role[],
  silhouetteColor?: number,
): readonly StepTarget[] {
  const opaque = reference.pixels.filter((p) => p !== TRANSPARENT);
  const blockColor = silhouetteColor ?? mostUsedBaseColor(reference, roles) ?? opaque[0];
  const silhouette: StepTarget = {
    kind: 'silhouette',
    target: reference.pixels.map((p) => (p === TRANSPARENT ? TRANSPARENT : blockColor!)),
  };
  const roleSteps = ROLES.filter((role) => opaque.some((p) => roles[p] === role)).map(
    (role): StepTarget => ({
      kind: role,
      target: reference.pixels.map((p) =>
        p !== TRANSPARENT && roles[p] === role ? p : TRANSPARENT,
      ),
    }),
  );
  return [silhouette, ...roleSteps];
}

function isLessonSize(n: number): n is LessonSize {
  return (LESSON_SIZES as readonly number[]).includes(n);
}

function checkSpriteShape(
  width: number,
  height: number,
  palette: readonly Color[],
  roles: readonly Role[],
): LessonSize {
  if (height !== width || !isLessonSize(width)) {
    throw new RangeError(`A Lesson is 8x8, 16x16 or 32x32 pixels, not ${width}x${height}`);
  }
  if (roles.length !== palette.length) {
    throw new RangeError('A Lesson needs a Role for every palette color');
  }
  return width;
}

export function createLesson(options: {
  id: string;
  title: string;
  reference: Drawing;
  roles: readonly Role[];
  explanations: Partial<Record<StepKind, string>>;
  silhouetteColor?: number;
}): Lesson {
  const { id, title, reference, roles, explanations, silhouetteColor } = options;
  const size = checkSpriteShape(reference.width, reference.height, reference.palette, roles);
  if (
    silhouetteColor !== undefined &&
    !(
      Number.isInteger(silhouetteColor) &&
      silhouetteColor >= 0 &&
      silhouetteColor < reference.palette.length
    )
  ) {
    throw new RangeError(`Silhouette color ${silhouetteColor} is not in the palette`);
  }
  const steps = deriveSteps(reference, roles, silhouetteColor).map((step) => {
    const explanation = explanations[step.kind];
    if (explanation === undefined) {
      throw new RangeError(`The ${step.kind} Step needs an explanation`);
    }
    return { ...step, explanation };
  });
  const unexplained = STEP_KINDS.filter(
    (kind) => explanations[kind] !== undefined && !steps.some((s) => s.kind === kind),
  );
  if (unexplained.length > 0) {
    throw new RangeError(
      `The Reference Sprite has no ${unexplained.join(' or ')} Step for an explanation to go with`,
    );
  }
  return {
    id,
    title,
    size,
    palette: reference.palette,
    reference,
    animation: stillAnimation(reference),
    roles,
    steps,
  };
}

export interface FrameStepContent {
  readonly frame: number;
  readonly pose: FramePose;
  readonly explanation: string;
}

function checkFrameSteps(frameSteps: readonly FrameStepContent[], frameCount: number) {
  if (frameCount < 2) throw new RangeError('An animation Lesson needs at least 2 Frames');
  const seen = new Set<number>();
  for (const { frame } of frameSteps) {
    if (!Number.isInteger(frame) || frame < 0 || frame >= frameCount) {
      throw new RangeError(`The animation has no Frame ${frame + 1}`);
    }
    if (seen.has(frame)) throw new RangeError(`Frame ${frame + 1} has more than one Step`);
    seen.add(frame);
  }
  for (let frame = 0; frame < frameCount; frame++) {
    if (!seen.has(frame)) throw new RangeError(`Frame ${frame + 1} has no Step`);
  }
  if (frameSteps[0]?.pose !== 'key') {
    throw new RangeError('An animation Lesson starts with a key pose');
  }
  const firstInBetween = frameSteps.findIndex((s) => s.pose === 'in-between');
  if (firstInBetween >= 0 && frameSteps.slice(firstInBetween).some((s) => s.pose === 'key')) {
    throw new RangeError('Key poses come before in-betweens');
  }
}

export function createAnimationLesson(options: {
  id: string;
  title: string;
  animation: Animation;
  roles: readonly Role[];
  frameSteps: readonly FrameStepContent[];
}): Lesson {
  const { id, title, animation, roles, frameSteps } = options;
  const size = checkSpriteShape(animation.width, animation.height, animation.palette, roles);
  if (!isValidFps(animation.fps)) {
    throw new RangeError(`An animation Lesson cannot play at ${animation.fps} FPS`);
  }
  checkFrameSteps(frameSteps, animation.frames.length);
  const steps = frameSteps.map(({ frame, pose, explanation }): FrameStep => ({
    kind: 'frame',
    frame,
    pose,
    target: animation.frames[frame]!,
    explanation,
  }));
  return {
    id,
    title,
    size,
    palette: animation.palette,
    reference: frameDrawing(animation, 0),
    animation,
    roles,
    steps,
  };
}

export interface TileStepContent {
  readonly name: string;
  readonly seamless: readonly EdgePair[];
  readonly explanation: string;
}

export function createTilesetLesson(options: {
  id: string;
  title: string;
  tiles: Animation;
  roles: readonly Role[];
  tileSteps: readonly TileStepContent[];
}): Lesson {
  const { id, title, tiles, roles, tileSteps } = options;
  if (tiles.width !== TILE_SIZE || tiles.height !== TILE_SIZE) {
    throw new RangeError(
      `A tileset Lesson is made of ${TILE_SIZE}x${TILE_SIZE} tiles, not ${tiles.width}x${tiles.height}`,
    );
  }
  const size = checkSpriteShape(tiles.width, tiles.height, tiles.palette, roles);
  if (tileSteps.length !== tiles.frames.length) {
    throw new RangeError(
      `The tileset has ${tiles.frames.length} tiles but ${tileSteps.length} tile Steps`,
    );
  }
  const steps = tileSteps.map(({ name, seamless, explanation }, tile): TileStep => ({
    kind: 'tile',
    tile,
    name,
    seamless,
    target: tiles.frames[tile]!,
    explanation,
  }));
  return {
    id,
    title,
    size,
    palette: tiles.palette,
    reference: frameDrawing(tiles, 0),
    animation: tiles,
    roles,
    steps,
  };
}
