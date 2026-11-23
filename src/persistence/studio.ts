import { TRANSPARENT, type Drawing } from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { checkCustomPalette, type CustomPalette } from '../core/palettes';
import { createBackup, readBackup } from './backup';
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
      readonly palettes: readonly CustomPalette[];
      readonly problem: StorageProblem | null;
    };

export interface Studio {
  getState(): StudioState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  create(drawing: Drawing): void;
  open(id: string): void;
  savePalette(palette: CustomPalette): Promise<void>;
  deletePalette(id: string): Promise<void>;
  flush(): Promise<void>;
  backup(): Promise<string>;
  restore(backup: string): Promise<RestoreOutcome>;
}

export type RestoreOutcome =
  | { readonly ok: true; readonly drawingCount: number; readonly paletteCount: number }
  | { readonly ok: false; readonly message: string };

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

  let restoring = false;

  function keep(id: string, drawing: Drawing) {
    if (state.status !== 'ready' || restoring) return;
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

  async function flush() {
    while (pending.size > 0) await Promise.all(pending);
  }

  function load() {
    loading ??= (async () => {
      let drawings: SavedDrawing[] = [];
      let palettes: CustomPalette[] = [];
      let problem: StorageProblem | null = null;
      try {
        [drawings, palettes] = await Promise.all([
          store.listStudioDrawings(),
          store.listCustomPalettes(),
        ]);
      } catch (error) {
        problem = problemOf(error);
      }
      const latest = drawings[0];
      const current = latest
        ? startEditing(latest.id, latest.drawing)
        : startEditing(crypto.randomUUID(), firstDrawing);
      state = { status: 'ready', current, drawings, palettes, problem };
      publish();
    })();
    return loading;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
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
    async savePalette(palette) {
      const checked = checkCustomPalette(palette);
      if (!checked) throw new RangeError('A palette needs a name and 1 to 32 distinct colors');
      await store.putCustomPalette(checked);
      update({ palettes: await store.listCustomPalettes() });
    },
    async deletePalette(id) {
      await store.deleteCustomPalette(id);
      update({ palettes: await store.listCustomPalettes() });
    },
    flush,
    async backup() {
      await flush();
      return createBackup(store);
    },
    async restore(backup) {
      const reading = readBackup(backup);
      if (!reading.ok) return reading;
      restoring = true;
      try {
        await flush();
        await store.replaceAll(reading.contents);
      } catch (error) {
        return { ok: false, message: RESTORE_FAILED[problemOf(error)] };
      } finally {
        restoring = false;
      }
      failed.clear();
      newest.clear();
      loading = undefined;
      await load();
      return {
        ok: true,
        drawingCount: reading.contents.studioDrawings.length,
        paletteCount: reading.contents.customPalettes.length,
      };
    },
  };
}

const RESTORE_FAILED: Record<StorageProblem, string> = {
  unavailable: 'Browser storage is unavailable.',
  full: 'Browser storage is too full to hold this backup.',
};

function problemOf(error: unknown): StorageProblem {
  return error instanceof StorageError ? error.problem : 'unavailable';
}
