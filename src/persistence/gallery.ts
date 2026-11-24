import type { Drawing } from '../core/drawing';
import type { Mode } from '../core/lesson';
import { StorageError, type Attempt, type Store, type StorageProblem } from './store';

export type GalleryEntry =
  | {
      readonly kind: 'studio';
      readonly id: string;
      readonly drawing: Drawing;
      readonly date: number;
    }
  | {
      readonly kind: 'attempt';
      readonly id: string;
      readonly drawing: Drawing;
      readonly date: number;
      readonly lessonId: string;
      readonly mode: Mode;
      readonly score: number;
      readonly hintFlashes: number;
    };

export type GalleryState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly entries: readonly GalleryEntry[];
      readonly attemptsByLesson: ReadonlyMap<string, readonly Attempt[]>;
      readonly problem: StorageProblem | null;
    };

export interface Gallery {
  getState(): GalleryState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  saveAttempt(attemptId: string): Promise<void>;
}

function attemptEntry(attempt: Attempt): GalleryEntry {
  const { id, drawing, finishedAt, lessonId, mode, score, hintFlashes } = attempt;
  return { kind: 'attempt', id, drawing, date: finishedAt, lessonId, mode, score, hintFlashes };
}

function groupByLesson(attempts: readonly Attempt[]): Map<string, Attempt[]> {
  const byLesson = new Map<string, Attempt[]>();
  for (const attempt of [...attempts].sort((a, b) => a.finishedAt - b.finishedAt)) {
    const atLesson = byLesson.get(attempt.lessonId) ?? [];
    atLesson.push(attempt);
    byLesson.set(attempt.lessonId, atLesson);
  }
  return byLesson;
}

export function createGallery(options: { store: Store }): Gallery {
  const { store } = options;
  let state: GalleryState = { status: 'loading' };
  let latestRead = 0;
  const listeners = new Set<() => void>();

  async function read(): Promise<Extract<GalleryState, { status: 'ready' }>> {
    try {
      const [studioDrawings, attempts] = await Promise.all([
        store.listStudioDrawings(),
        store.listAttempts(),
      ]);
      const entries: GalleryEntry[] = [
        ...studioDrawings.map(({ id, drawing, updatedAt }) => ({
          kind: 'studio' as const,
          id,
          drawing,
          date: updatedAt,
        })),
        ...attempts.filter((a) => a.inGallery).map(attemptEntry),
      ].sort((a, b) => b.date - a.date);
      return { status: 'ready', entries, attemptsByLesson: groupByLesson(attempts), problem: null };
    } catch (error) {
      const problem = error instanceof StorageError ? error.problem : 'unavailable';
      return { status: 'ready', entries: [], attemptsByLesson: new Map(), problem };
    }
  }

  async function refresh() {
    const thisRead = ++latestRead;
    const next = await read();
    if (thisRead !== latestRead) return;
    state = next;
    for (const listener of listeners) listener();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    async saveAttempt(attemptId) {
      await store.saveAttemptToGallery(attemptId);
      await refresh();
    },
  };
}
