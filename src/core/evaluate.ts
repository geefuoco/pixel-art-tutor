import { TRANSPARENT, type Drawing, type Point } from './drawing';
import type { Lesson } from './lesson';
import { LESSON_PASS_SCORE } from './thresholds';

export interface StepCheck {
  readonly missing: readonly Point[];
  readonly extra: readonly Point[];
}

function stepOfPixel(lesson: Lesson, referenceColor: number): number {
  return lesson.steps.findIndex((s) => s.kind === lesson.roles[referenceColor]);
}

export function checkStep(lesson: Lesson, stepIndex: number, drawing: Drawing): StepCheck {
  const step = lesson.steps[stepIndex];
  if (!step) throw new RangeError(`Lesson ${lesson.id} has no Step ${stepIndex}`);
  const silhouette = lesson.steps[0]!.target;
  const missing: Point[] = [];
  const extra: Point[] = [];
  lesson.reference.pixels.forEach((referenceColor, i) => {
    const drawn = drawing.pixels[i]!;
    const at = { x: i % lesson.size, y: Math.floor(i / lesson.size) };
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

export function scoreLessonDrawing(lesson: Lesson, drawing: Drawing): number {
  let compared = 0;
  let correct = 0;
  lesson.reference.pixels.forEach((referenceColor, i) => {
    const drawn = drawing.pixels[i]!;
    if (referenceColor === TRANSPARENT && drawn === TRANSPARENT) return;
    compared++;
    if (drawn === referenceColor) correct++;
  });
  return compared === 0 ? 0 : correct / compared;
}

export function passesLesson(score: number): boolean {
  return score >= LESSON_PASS_SCORE;
}
