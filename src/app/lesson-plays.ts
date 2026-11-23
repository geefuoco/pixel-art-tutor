import { useSyncExternalStore } from 'react';
import type { Lesson, Mode } from '../core/lesson';
import {
  createLessonPlay,
  type LessonPlay,
  type LessonPlayState,
} from '../persistence/lesson-play';
import { browserStore } from './browser-store';

export interface PlayHandle {
  readonly play: LessonPlay;
  readonly subscribe: (listener: () => void) => () => void;
}

const plays = new Map<string, PlayHandle>();

export function lessonPlayFor(lesson: Lesson, mode: Mode): PlayHandle {
  const key = `${lesson.id}/${mode}`;
  let handle = plays.get(key);
  if (!handle) {
    const play = createLessonPlay({ store: browserStore, lesson, mode });
    handle = {
      play,
      subscribe(listener) {
        void play.load();
        return play.subscribe(listener);
      },
    };
    plays.set(key, handle);
  }
  return handle;
}

export function useLessonPlay({ play, subscribe }: PlayHandle): LessonPlayState {
  return useSyncExternalStore(subscribe, play.getState);
}

export function forgetLessonPlays() {
  plays.clear();
}
