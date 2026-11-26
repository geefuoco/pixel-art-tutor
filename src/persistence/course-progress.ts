import type { Mode } from '../core/lesson';
import { recordPass, type Progress } from '../core/progress';
import { StorageError, type Store, type StorageProblem } from './store';

export type CourseProgressState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly progress: Progress;
      readonly problem: StorageProblem | null;
    };

export interface CourseProgress {
  getState(): CourseProgressState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  reload(): Promise<void>;
  notePass(lessonId: string, mode: Mode): void;
}

export function createCourseProgress(options: { store: Store }): CourseProgress {
  const { store } = options;
  let state: CourseProgressState = { status: 'loading' };
  let loading: Promise<void> | undefined;
  let passesThisVisit: Progress = [];
  const listeners = new Set<() => void>();

  function publish(next: CourseProgressState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function withPassesThisVisit(progress: Progress): Progress {
    return passesThisVisit.reduce(
      (all, { lessonId, passedModes }) =>
        passedModes.reduce((p, mode) => recordPass(p, lessonId, mode), all),
      progress,
    );
  }

  async function read() {
    let progress: Progress = [];
    let problem: StorageProblem | null = null;
    try {
      progress = await store.listProgress();
    } catch (error) {
      problem = error instanceof StorageError ? error.problem : 'unavailable';
    }
    publish({ status: 'ready', progress: withPassesThisVisit(progress), problem });
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
      passesThisVisit = [];
      loading = read();
      return loading;
    },
    notePass(lessonId, mode) {
      passesThisVisit = recordPass(passesThisVisit, lessonId, mode);
      if (state.status === 'ready') {
        publish({ ...state, progress: recordPass(state.progress, lessonId, mode) });
      }
    },
  };
}
