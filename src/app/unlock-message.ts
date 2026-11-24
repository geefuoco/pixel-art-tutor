import type { Mode } from '../core/lesson';
import { unlockRequirement, type Progress } from '../core/progress';
import type { CourseLesson } from './lessons-store';
import { MODE_NAMES } from './mode-names';

export function unlockMessage(
  lessons: readonly CourseLesson[],
  progress: Progress,
  lessonId: string,
  mode: Mode,
): string | null {
  const ids = lessons.map((l) => l.lesson.id);
  const needed = unlockRequirement(ids, progress, lessonId, mode);
  if (!needed) return null;
  const titleOf = (id: string) => lessons.find((l) => l.lesson.id === id)!.lesson.title;
  const unlocks = needed.lessonId === lessonId ? MODE_NAMES[mode] : titleOf(lessonId);
  return `Pass ${titleOf(needed.lessonId)} in ${MODE_NAMES[needed.mode]} to unlock ${unlocks}.`;
}
