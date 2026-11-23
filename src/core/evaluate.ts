import { TRANSPARENT, type Drawing, type Point } from './drawing';
import type { Lesson } from './lesson';
import { LESSON_PASS_SCORE } from './thresholds';

export interface StepCheck {
  readonly missing: readonly Point[];
  readonly extra: readonly Point[];
}

function stepOfPixel(lesson: Lesson, reference: number): number {
  return lesson.steps.findIndex((s) => s.kind === lesson.roles[reference]);
}

export function checkStep(lesson: Lesson, stepIndex: number, drawing: Drawing): StepCheck {
  const step = lesson.steps[stepIndex];
  if (!step) throw new RangeError(`Lesson ${lesson.id} has no Step ${stepIndex}`);
  const silhouette = lesson.steps[0]!.target;
  const missing: Point[] = [];
  const extra: Point[] = [];
  lesson.reference.pixels.forEach((reference, i) => {
    const drawn = drawing.pixels[i]!;
    const at = { x: i % lesson.size, y: Math.floor(i / lesson.size) };
    if (reference === TRANSPARENT) {
      if (drawn !== TRANSPARENT) extra.push(at);
      return;
    }
    const pixelStep = stepOfPixel(lesson, reference);
    const expected = pixelStep <= stepIndex ? reference : silhouette[i]!;
    const right = drawn === expected || drawn === reference;
    if (step.target[i] !== TRANSPARENT) {
      if (!right) missing.push(at);
    } else if (pixelStep < stepIndex && drawn !== TRANSPARENT && !right) {
      extra.push(at);
    }
  });
  return { missing, extra };
}

export function scoreLessonDrawing(lesson: Lesson, drawing: Drawing): number {
  let compared = 0;
  let right = 0;
  lesson.reference.pixels.forEach((reference, i) => {
    const drawn = drawing.pixels[i]!;
    if (reference === TRANSPARENT && drawn === TRANSPARENT) return;
    compared++;
    if (drawn === reference) right++;
  });
  return compared === 0 ? 0 : right / compared;
}

export function passesLesson(score: number): boolean {
  return score >= LESSON_PASS_SCORE;
}
