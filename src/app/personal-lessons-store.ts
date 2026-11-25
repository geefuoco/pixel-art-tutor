import { useSyncExternalStore } from 'react';
import type { Lesson } from '../core/lesson';
import { createPersonalLessons, type PersonalLessonsState } from '../persistence/personal-lessons';
import { browserStore } from './browser-store';
import type { LessonEntry } from './lessons-store';
import { thumbnail } from './thumbnail';

export const personalLessons = createPersonalLessons({ store: browserStore });

function subscribe(listener: () => void) {
  void personalLessons.load();
  return personalLessons.subscribe(listener);
}

export function usePersonalLessons(): PersonalLessonsState {
  return useSyncExternalStore(subscribe, personalLessons.getState);
}

const entries = new WeakMap<Lesson, LessonEntry>();

export function personalLessonEntry(lesson: Lesson): LessonEntry {
  let entry = entries.get(lesson);
  if (!entry) {
    entry = { lesson, referenceUrl: thumbnail(lesson.reference), exampleUrl: () => undefined };
    entries.set(lesson, entry);
  }
  return entry;
}
