import { useSyncExternalStore } from 'react';
import { createCourseProgress, type CourseProgressState } from '../persistence/course-progress';
import { browserStore } from './browser-store';

export const courseProgress = createCourseProgress({ store: browserStore });

function subscribe(listener: () => void) {
  void courseProgress.load();
  return courseProgress.subscribe(listener);
}

export function useCourseProgress(): CourseProgressState {
  return useSyncExternalStore(subscribe, courseProgress.getState);
}
