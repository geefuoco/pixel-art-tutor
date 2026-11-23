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
  /** Edits the kept drawing with this id, with fresh undo history. Does nothing for the current drawing. */
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

  // Writes run one at a time. While one runs, only the latest unwritten version of
  // each drawing waits, so a fast stroke costs a few writes rather than one per pixel.
  const unwritten = new Map<string, SavedDrawing>();
  let writing: Promise<void> | null = null;

  function update(next: Partial<Extract<StudioState, { status: 'ready' }>>) {
    if (state.status !== 'ready') throw new Error('The Studio has not loaded');
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  function setProblem(problem: StorageProblem | null) {
    if (state.status === 'ready' && state.problem !== problem) update({ problem });
  }

  async function writeAll() {
    for (let entry = first(unwritten); entry; entry = first(unwritten)) {
      unwritten.delete(entry.id);
      try {
        await store.putStudioDrawing(entry);
        setProblem(null);
      } catch (error) {
        setProblem(error instanceof StorageError ? error.problem : 'unavailable');
      }
    }
    writing = null;
  }

  /** Keeps the drawing: puts it first in the list and writes it. */
  function keep(id: string, drawing: Drawing) {
    if (state.status !== 'ready') return;
    const entry = { id, drawing, updatedAt: now() };
    update({ drawings: [entry, ...state.drawings.filter((d) => d.id !== id)] });
    unwritten.set(id, entry);
    writing ??= writeAll();
  }

  /** Edits `drawing` as the current drawing, keeping each change. */
  function edit(id: string, drawing: Drawing): CurrentDrawing {
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
          problem = error instanceof StorageError ? error.problem : 'unavailable';
        }
        const latest = drawings[0];
        const current = latest
          ? edit(latest.id, latest.drawing)
          : edit(crypto.randomUUID(), firstDrawing);
        state = { status: 'ready', current, drawings, problem };
        for (const listener of listeners) listener();
      })();
      return loading;
    },
    create(drawing) {
      const current = edit(crypto.randomUUID(), drawing);
      update({ current });
      if (drawing.pixels.some((p) => p !== TRANSPARENT)) keep(current.id, drawing);
    },
    open(id) {
      if (state.status !== 'ready' || state.current.id === id) return;
      const entry = state.drawings.find((d) => d.id === id);
      if (entry) update({ current: edit(id, entry.drawing) });
    },
    flush: () => writing ?? Promise.resolve(),
  };
}

function first<T>(map: Map<string, T>): T | undefined {
  return map.values().next().value;
}
