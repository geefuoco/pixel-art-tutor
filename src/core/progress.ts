import { MODES, type Mode } from './lesson';

export interface LessonProgress {
  readonly lessonId: string;
  readonly passedModes: readonly Mode[];
}

export type Progress = readonly LessonProgress[];

export function hasPassed(progress: Progress, lessonId: string, mode: Mode): boolean {
  return progress.some((p) => p.lessonId === lessonId && p.passedModes.includes(mode));
}

export function recordPass(progress: Progress, lessonId: string, mode: Mode): Progress {
  if (hasPassed(progress, lessonId, mode)) return progress;
  const existing = progress.find((p) => p.lessonId === lessonId);
  if (!existing) return [...progress, { lessonId, passedModes: [mode] }];
  const passedModes = MODES.filter((m) => m === mode || existing.passedModes.includes(m));
  return progress.map((p) => (p === existing ? { lessonId, passedModes } : p));
}

export function modeUnlocked(progress: Progress, lessonId: string, mode: Mode): boolean {
  const previous = MODES[MODES.indexOf(mode) - 1];
  return previous === undefined || hasPassed(progress, lessonId, previous);
}

export function lessonUnlocked(
  course: readonly string[],
  progress: Progress,
  lessonId: string,
): boolean {
  const position = course.indexOf(lessonId);
  if (position < 0) return false;
  if (position === 0) return true;
  const passedBefore = progress.some((p) => p.lessonId === lessonId && p.passedModes.length > 0);
  return passedBefore || hasPassed(progress, course[position - 1]!, 'trace');
}

export interface UnlockRequirement {
  readonly lessonId: string;
  readonly mode: Mode;
}

export function unlockRequirement(
  course: readonly string[],
  progress: Progress,
  lessonId: string,
  mode: Mode,
): UnlockRequirement | null {
  const position = course.indexOf(lessonId);
  if (position < 0) throw new RangeError(`${lessonId} is not in the Course`);
  if (!lessonUnlocked(course, progress, lessonId)) {
    return { lessonId: course[position - 1]!, mode: 'trace' };
  }
  if (!modeUnlocked(progress, lessonId, mode)) {
    return { lessonId, mode: MODES[MODES.indexOf(mode) - 1]! };
  }
  return null;
}
