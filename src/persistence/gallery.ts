import {
  StorageError,
  type Attempt,
  type PromptDrawing,
  type SavedDrawing,
  type Store,
  type StorageProblem,
} from './store';

export type GalleryEntry =
  | { readonly kind: 'studio'; readonly date: number; readonly studioDrawing: SavedDrawing }
  | { readonly kind: 'attempt'; readonly date: number; readonly attempt: Attempt }
  | { readonly kind: 'prompt'; readonly date: number; readonly promptDrawing: PromptDrawing };

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
  saveAttemptToGallery(attemptId: string): Promise<void>;
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
      const [studioDrawings, attempts, promptDrawings] = await Promise.all([
        store.listStudioDrawings(),
        store.listAttempts(),
        store.listPromptDrawings(),
      ]);
      const entries: GalleryEntry[] = [
        ...studioDrawings.map((studioDrawing) => ({
          kind: 'studio' as const,
          date: studioDrawing.updatedAt,
          studioDrawing,
        })),
        ...attempts
          .filter((attempt) => attempt.inGallery)
          .map((attempt) => ({ kind: 'attempt' as const, date: attempt.finishedAt, attempt })),
        ...promptDrawings
          .filter((promptDrawing) => promptDrawing.inGallery)
          .map((promptDrawing) => ({
            kind: 'prompt' as const,
            date: promptDrawing.updatedAt,
            promptDrawing,
          })),
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
    async saveAttemptToGallery(attemptId) {
      await store.saveAttemptToGallery(attemptId);
      await refresh();
    },
  };
}
