import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawing, TRANSPARENT as _ } from '../core/drawing';
import { openStore } from './store';
import { createStudio, type Studio } from './studio';

const PALETTE = ['#000000', '#ff0000'];

function blank(width: number, height: number) {
  return createDrawing({ width, height, palette: PALETTE });
}

/** A Studio over `indexedDB`, loaded, as after opening the page. */
async function openStudio(indexedDB: IDBFactory | undefined, firstDrawing = blank(3, 2)) {
  const studio = createStudio({ store: openStore(indexedDB), firstDrawing });
  await studio.load();
  return studio;
}

function ready(studio: Studio) {
  const state = studio.getState();
  if (state.status !== 'ready') throw new Error('The Studio has not loaded');
  return state;
}

function current(studio: Studio) {
  return ready(studio).current.editor.getState();
}

describe('Studio autosave', () => {
  it('resumes the drawing exactly after a reload, without its undo history', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    const { editor } = ready(studio).current;
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 2, y: 1 }] });
    editor.apply({ type: 'pencil', color: 0, points: [{ x: 1, y: 1 }] }, { mergeWithLast: true });
    await studio.flush();

    const reloaded = await openStudio(indexedDB, blank(8, 8));
    expect(current(reloaded)).toEqual({
      drawing: { width: 3, height: 2, palette: PALETTE, pixels: [1, _, _, _, 0, 0] },
      canUndo: false,
      canRedo: false,
    });
  });

  it('keeps any number of drawings, opens the most recently changed and reopens the others', async () => {
    const indexedDB = new IDBFactory();
    let time = 0;
    const studio = createStudio({
      store: openStore(indexedDB),
      firstDrawing: blank(3, 2),
      now: () => ++time,
    });
    await studio.load();
    const firstId = ready(studio).current.id;
    ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    studio.create(blank(1, 1));
    ready(studio).current.editor.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });
    await studio.flush();

    const reloaded = await openStudio(indexedDB);
    expect(current(reloaded).drawing).toEqual({
      width: 1,
      height: 1,
      palette: PALETTE,
      pixels: [0],
    });
    expect(ready(reloaded).drawings.map((d) => [d.drawing.width, d.drawing.height])).toEqual([
      [1, 1],
      [3, 2],
    ]);

    reloaded.open(firstId);
    expect(ready(reloaded).current.id).toBe(firstId);
    expect(current(reloaded).drawing.pixels).toEqual([1, _, _, _, _, _]);
  });

  it('keeps a new drawing with pixels at once, but an untouched blank one never', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    studio.create(blank(2, 2));
    await studio.flush();
    expect(ready(await openStudio(indexedDB)).drawings).toEqual([]);

    const imported = { ...blank(2, 1), pixels: [_, 1] };
    studio.create(imported);
    await studio.flush();
    const reloaded = await openStudio(indexedDB);
    expect(current(reloaded).drawing).toEqual({
      width: 2,
      height: 1,
      palette: PALETTE,
      pixels: [_, 1],
    });
    expect(ready(reloaded).drawings).toHaveLength(1);
  });
});

describe('Studio storage problems', () => {
  afterEach(() => vi.restoreAllMocks());

  it('still opens and edits a drawing when storage is unavailable, and says so', async () => {
    const studio = await openStudio(undefined);
    expect(ready(studio).problem).toBe('unavailable');
    ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    await studio.flush();
    expect(ready(studio).problem).toBe('unavailable');
    expect(current(studio).drawing.pixels).toEqual([_, 1, _, _, _, _]);
  });

  it('says storage is full while a save goes over the quota, until a later save succeeds', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    expect(ready(studio).problem).toBeNull();
    const { editor } = ready(studio).current;

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    await studio.flush();
    expect(ready(studio).problem).toBe('full');

    vi.restoreAllMocks();
    editor.apply({ type: 'pencil', color: 1, points: [{ x: 1, y: 0 }] });
    await studio.flush();
    expect(ready(studio).problem).toBeNull();
    expect(current(await openStudio(indexedDB)).drawing.pixels).toEqual([1, 1, _, _, _, _]);
  });
});
