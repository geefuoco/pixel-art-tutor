import { TRANSPARENT, type Color, type Drawing } from './drawing';

export const ROLES = ['outline', 'base', 'shadow', 'highlight'] as const;
export type Role = (typeof ROLES)[number];

export const STEP_KINDS = ['silhouette', ...ROLES] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const MODES = ['trace'] as const;
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

export interface LessonStep extends StepTarget {
  readonly explanation: string;
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly size: LessonSize;
  readonly palette: readonly Color[];
  readonly reference: Drawing;
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

export function createLesson(options: {
  id: string;
  title: string;
  reference: Drawing;
  roles: readonly Role[];
  explanations: Partial<Record<StepKind, string>>;
  silhouetteColor?: number;
}): Lesson {
  const { id, title, reference, roles, explanations, silhouetteColor } = options;
  const size = reference.width;
  if (reference.height !== size || !isLessonSize(size)) {
    throw new RangeError(
      `A Lesson is 8x8, 16x16 or 32x32 pixels, not ${reference.width}x${reference.height}`,
    );
  }
  if (roles.length !== reference.palette.length) {
    throw new RangeError('A Lesson needs a Role for every palette color');
  }
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
  return { id, title, size, palette: reference.palette, reference, roles, steps };
}
