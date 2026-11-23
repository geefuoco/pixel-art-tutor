import { TRANSPARENT, type Drawing } from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { StorageError, type SavedDrawing, type Store, type StorageProblem } from './store';

/** The drawing being edited in the Studio. */
export interface CurrentDrawing {
  readonly id: string;
  readonly editor: Editor;
}

export type StudioState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly current: CurrentDrawing;
      /** Every kept drawing with its latest pixels, most recently changed first. */
      readonly drawings: readonly SavedDrawing[];
      /** Set while the latest load or save failed, so changes may not be kept. */
      readonly problem: StorageProblem | null;
    };

/**
 * The Studio's drawings: which one is being edited, and the rest, kept in a Store.
 * Every change to the current drawing is saved. Subscribable, so UI can read it
 * with useSyncExternalStore.
 */
export interface Studio {
  /** The same object until the next change. */
  getState(): StudioState;
  subscribe(listener: () => void): () => void;
  /**
   * Loads the saved drawings and opens the most recently changed one, or the
   * first drawing if there are none or storage is unavailable. Later calls
   * return the first call's promise.
   */
  load(): Promise<void>;
  /**
   * Starts editing a new drawing. One with any pixels (an opened PNG, say) is kept at
   * once; a blank one on its first change, so trying out sizes leaves nothing behind.
   */
  create(drawing: Drawing): void;
  /**
   * Edits the kept drawing with this id, with fresh undo history, and puts it first so
   * a reload resumes it. Does nothing for the current drawing.
   */
  open(id: string): void;
  /** Resolves once every change made so far has been written, or failed to be. */
  flush(): Promise<void>;
}

export function createStudio(options: {
  store: Store;
  /** What a first visit opens. */
  firstDrawing: Drawing;
  now?: () => number;
}): Studio {
  const { store, firstDrawing, now = Date.now } = options;
  let state: StudioState = { status: 'loading' };
  let loading: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  let stopAutosave = () => {};

  // Each change is written at once: IndexedDB runs writes to one object store in the
  // order they start, so the newest version of a drawing is always written last.
  const pending = new Set<Promise<void>>();
  /** The newest version of each drawing sent to the store. */
  const newest = new Map<string, SavedDrawing>();
  /** Drawings whose newest version failed to save, retried after the next save that works. */
  const failed = new Map<string, SavedDrawing>();
  /** The last updatedAt given out. Each is later than the one before, even within a millisecond. */
  let lastStamp = -Infinity;

  function publish() {
    for (const listener of listeners) listener();
  }

  function update(next: Partial<Extract<StudioState, { status: 'ready' }>>) {
    if (state.status !== 'ready') throw new Error('The Studio has not loaded');
    state = { ...state, ...next };
    publish();
  }

  function setProblem(problem: StorageProblem | null) {
    if (state.status === 'ready' && state.problem !== problem) update({ problem });
  }

  function write(entry: SavedDrawing) {
    newest.set(entry.id, entry);
    failed.delete(entry.id);
    const done = store.putStudioDrawing(entry).then(
      () => {
        const retries = [...failed.values()];
        if (retries.length === 0) setProblem(null);
        // Their outcome settles the problem.
        for (const retry of retries) write(retry);
      },
      (error: unknown) => {
        if (newest.get(entry.id) === entry) failed.set(entry.id, entry);
        setProblem(problemOf(error));
      },
    );
    pending.add(done);
    void done.finally(() => pending.delete(done));
  }

  /** Keeps the drawing: puts it first in the list and writes it. */
  function keep(id: string, drawing: Drawing) {
    if (state.status !== 'ready') return;
    lastStamp = Math.max(now(), lastStamp + 1);
    const entry = { id, drawing, updatedAt: lastStamp };
    update({ drawings: [entry, ...state.drawings.filter((d) => d.id !== id)] });
    write(entry);
  }

  /** Makes `drawing` the one being edited, with fresh undo history, keeping each change. */
  function startEditing(id: string, drawing: Drawing): CurrentDrawing {
    stopAutosave();
    const editor = createEditor(drawing);
    stopAutosave = editor.subscribe(() => keep(id, editor.getState().drawing));
    return { id, editor };
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      loading ??= (async () => {
        let drawings: SavedDrawing[] = [];
        let problem: StorageProblem | null = null;
        try {
          drawings = await store.listStudioDrawings();
        } catch (error) {
          problem = problemOf(error);
        }
        const latest = drawings[0];
        const current = latest
          ? startEditing(latest.id, latest.drawing)
          : startEditing(crypto.randomUUID(), firstDrawing);
        state = { status: 'ready', current, drawings, problem };
        publish();
      })();
      return loading;
    },
    create(drawing) {
      const current = startEditing(crypto.randomUUID(), drawing);
      update({ current });
      if (drawing.pixels.some((p) => p !== TRANSPARENT)) keep(current.id, drawing);
    },
    open(id) {
      if (state.status !== 'ready' || state.current.id === id) return;
      const entry = state.drawings.find((d) => d.id === id);
      if (!entry) return;
      update({ current: startEditing(id, entry.drawing) });
      // Kept again so it comes first, and a reload resumes it.
      keep(id, entry.drawing);
    },
    async flush() {
      while (pending.size > 0) await Promise.all(pending);
    },
  };
}

/** The Store promises StorageErrors; anything else still means nothing was kept. */
function problemOf(error: unknown): StorageProblem {
  return error instanceof StorageError ? error.problem : 'unavailable';
}
