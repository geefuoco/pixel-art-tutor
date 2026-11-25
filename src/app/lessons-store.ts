import { useSyncExternalStore } from 'react';
import type { Lesson } from '../core/lesson';
import { readLesson } from '../core/lesson-content';
import { decodePng } from './png-image';
import { thumbnail } from './thumbnail';

const LESSONS_DIR = '/content/lessons/';

const course = import.meta.glob<unknown>('/content/course.json', {
  eager: true,
  import: 'default',
})['/content/course.json'];
const manifests = import.meta.glob<unknown>('/content/lessons/*/manifest.json', {
  eager: true,
  import: 'default',
});
const references = import.meta.glob<string>('/content/lessons/*/reference.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const exampleUrls = import.meta.glob<string>('/content/lessons/*/examples/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface LessonEntry {
  readonly lesson: Lesson;
  readonly referenceUrl: string;
  readonly exampleUrl: (src: string) => string | undefined;
}

export type CourseState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly lessons: readonly LessonEntry[] }
  | { readonly status: 'failed'; readonly message: string };

async function loadLesson(id: string): Promise<LessonEntry> {
  const dir = `${LESSONS_DIR}${id}/`;
  const manifest = manifests[`${dir}manifest.json`];
  const referenceUrl = references[`${dir}reference.png`];
  if (manifest === undefined || referenceUrl === undefined) {
    throw new Error(`The Lesson ${id} has no manifest.json or reference.png`);
  }
  const examples = new Map(
    Object.entries(exampleUrls)
      .filter(([path]) => path.startsWith(dir))
      .map(([path, url]) => [path.slice(dir.length), url]),
  );
  const response = await fetch(referenceUrl);
  if (!response.ok) throw new Error(`The Reference Sprite for ${id} did not load`);
  const reading = readLesson({
    manifest,
    reference: await decodePng(await response.blob()),
    exampleSprites: [...examples.keys()],
  });
  if (!reading.ok) throw new Error(`The Lesson ${id} is broken: ${reading.problem}`);
  if (reading.lesson.id !== id) {
    throw new Error(`The Lesson in ${dir} says its id is ${reading.lesson.id}`);
  }
  const { lesson } = reading;
  return {
    lesson,
    referenceUrl: lesson.animation.frames.length > 1 ? thumbnail(lesson.reference) : referenceUrl,
    exampleUrl: (src) => examples.get(src),
  };
}

let courseState: CourseState = { status: 'loading' };
let loadingCourse: Promise<void> | undefined;
const courseListeners = new Set<() => void>();

function loadCourse() {
  loadingCourse ??= (async () => {
    try {
      if (!Array.isArray(course) || !course.every((id) => typeof id === 'string')) {
        throw new Error('content/course.json is not a list of Lesson ids');
      }
      courseState = { status: 'ready', lessons: await Promise.all(course.map(loadLesson)) };
    } catch (error) {
      courseState = {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    for (const listener of courseListeners) listener();
  })();
}

function subscribeToCourse(listener: () => void) {
  loadCourse();
  courseListeners.add(listener);
  return () => courseListeners.delete(listener);
}

export function useCourse(): CourseState {
  return useSyncExternalStore(subscribeToCourse, () => courseState);
}
