import { TRANSPARENT, type Drawing } from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { StorageError, type SavedDrawing, type Store, type StorageProblem } from './store';

export interface CurrentDrawing {
  readonly id: string;
  readonly editor: Editor;
}

export type StudioState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly current: CurrentDrawing;
      readonly drawings: readonly SavedDrawing[];
      readonly problem: StorageProblem | null;
    };

export interface Studio {
  getState(): StudioState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  create(drawing: Drawing): void;
  open(id: string): void;
  flush(): Promise<void>;
}

export function createStudio(options: {
  store: Store;
  firstDrawing: Drawing;
  now?: () => number;
}): Studio {
  const { store, firstDrawing, now = Date.now } = options;
  let state: StudioState = { status: 'loading' };
  let loading: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  let stopAutosave = () => {};

  const pending = new Set<Promise<void>>();
  const newest = new Map<string, SavedDrawing>();
  const failed = new Map<string, SavedDrawing>();
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

  function keep(id: string, drawing: Drawing) {
    if (state.status !== 'ready') return;
    lastStamp = Math.max(now(), lastStamp + 1);
    const entry = { id, drawing, updatedAt: lastStamp };
    update({ drawings: [entry, ...state.drawings.filter((d) => d.id !== id)] });
    write(entry);
  }

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
      keep(id, entry.drawing);
    },
    async flush() {
      while (pending.size > 0) await Promise.all(pending);
    },
  };
}

function problemOf(error: unknown): StorageProblem {
  return error instanceof StorageError ? error.problem : 'unavailable';
}
