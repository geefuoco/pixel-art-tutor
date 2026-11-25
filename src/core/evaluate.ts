import type { Animation } from './animation';
import { TRANSPARENT, type Drawing, type Point } from './drawing';
import type { FrameStep, Lesson, Mode } from './lesson';
import { FREEHAND_PASS_SCORE, LESSON_PASS_SCORE } from './thresholds';

export interface StepCheck {
  readonly missing: readonly Point[];
  readonly extra: readonly Point[];
}

function stepOfPixel(lesson: Lesson, referenceColor: number): number {
  return lesson.steps.findIndex((s) => s.kind === lesson.roles[referenceColor]);
}

function pointAt(i: number, size: number): Point {
  return { x: i % size, y: Math.floor(i / size) };
}

function checkFrameStep(lesson: Lesson, step: FrameStep, drawing: Drawing): StepCheck {
  const missing: Point[] = [];
  const extra: Point[] = [];
  step.target.forEach((expected, i) => {
    const drawn = drawing.pixels[i]!;
    if (expected === TRANSPARENT) {
      if (drawn !== TRANSPARENT) extra.push(pointAt(i, lesson.size));
    } else if (drawn !== expected) {
      missing.push(pointAt(i, lesson.size));
    }
  });
  return { missing, extra };
}

export function checkStep(lesson: Lesson, stepIndex: number, drawing: Drawing): StepCheck {
  const step = lesson.steps[stepIndex];
  if (!step) throw new RangeError(`Lesson ${lesson.id} has no Step ${stepIndex}`);
  if (step.kind === 'frame') return checkFrameStep(lesson, step, drawing);
  const silhouette = lesson.steps[0]!.target;
  const missing: Point[] = [];
  const extra: Point[] = [];
  lesson.reference.pixels.forEach((referenceColor, i) => {
    const drawn = drawing.pixels[i]!;
    const at = pointAt(i, lesson.size);
    if (referenceColor === TRANSPARENT) {
      if (drawn !== TRANSPARENT) extra.push(at);
      return;
    }
    const pixelStep = stepOfPixel(lesson, referenceColor);
    if (pixelStep > stepIndex && step.target[i] === TRANSPARENT) return;
    const expectedColor = pixelStep <= stepIndex ? referenceColor : silhouette[i]!;
    if (drawn !== expectedColor && drawn !== referenceColor) missing.push(at);
  });
  return { missing, extra };
}

export function scoreLessonAttempt(lesson: Lesson, attempt: Animation): number {
  let compared = 0;
  let correct = 0;
  lesson.animation.frames.forEach((referenceFrame, frame) => {
    const drawnFrame = attempt.frames[frame];
    referenceFrame.forEach((referenceColor, i) => {
      const drawn = drawnFrame?.[i] ?? TRANSPARENT;
      if (referenceColor === TRANSPARENT && drawn === TRANSPARENT) return;
      compared++;
      if (drawn === referenceColor) correct++;
    });
  });
  return compared === 0 ? 0 : correct / compared;
}

export function passScore(mode: Mode): number {
  return mode === 'freehand' ? FREEHAND_PASS_SCORE : LESSON_PASS_SCORE;
}

export function passesMode(mode: Mode, score: number): boolean {
  return score >= passScore(mode);
}
