import type { Drawing } from '../core/drawing';
import type { Lesson, Role } from '../core/lesson';
import { createPersonalLesson } from '../core/personal-lesson';
import { StorageError, type PersonalLessonRecord, type Store, type StorageProblem } from './store';

export type PersonalLessonsState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly lessons: readonly Lesson[];
      readonly problem: StorageProblem | null;
    };

export interface PersonalLessons {
  getState(): PersonalLessonsState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  reload(): Promise<void>;
  add(proposal: { title: string; reference: Drawing; roles: readonly Role[] }): Promise<Lesson>;
}

function lessonOf({ id, title, reference, roles }: PersonalLessonRecord): Lesson {
  return createPersonalLesson({ id, title, reference, roles });
}

export function createPersonalLessons(options: {
  store: Store;
  newId?: () => string;
  now?: () => number;
}): PersonalLessons {
  const { store, newId = () => `personal-${crypto.randomUUID()}`, now = Date.now } = options;
  let state: PersonalLessonsState = { status: 'loading' };
  let loading: Promise<void> | undefined;
  const listeners = new Set<() => void>();

  function publish(next: PersonalLessonsState) {
    state = next;
    for (const listener of listeners) listener();
  }

  async function read() {
    let lessons: Lesson[] = [];
    let problem: StorageProblem | null = null;
    try {
      lessons = (await store.listPersonalLessons()).map(lessonOf);
    } catch (error) {
      problem = error instanceof StorageError ? error.problem : 'unavailable';
    }
    publish({ status: 'ready', lessons, problem });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      loading ??= read();
      return loading;
    },
    reload() {
      loading = read();
      return loading;
    },
    async add({ title, reference, roles }) {
      const record: PersonalLessonRecord = {
        id: newId(),
        title,
        reference,
        roles,
        createdAt: now(),
      };
      const lesson = lessonOf(record);
      await store.putPersonalLesson(record);
      if (state.status === 'ready') publish({ ...state, lessons: [...state.lessons, lesson] });
      return lesson;
    },
  };
}
