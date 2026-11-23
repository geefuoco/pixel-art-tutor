import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawing, TRANSPARENT as _ } from '../core/drawing';
import { openStore } from './store';
import { createStudio, type Studio } from './studio';

const PALETTE = ['#000000', '#ff0000'];

function blank(width: number, height: number) {
  return createDrawing({ width, height, palette: PALETTE });
}

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

  it('resumes the drawing last opened after a reload, even if it was not changed', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    const firstId = ready(studio).current.id;
    ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    studio.create({ ...blank(1, 1), pixels: [0] });
    studio.open(firstId);
    await studio.flush();

    const reloaded = await openStudio(indexedDB);
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

describe('Studio custom palettes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps saved palettes in name order across a reload, with changes and deletions', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    expect(ready(studio).palettes).toEqual([]);

    await studio.savePalette({ id: 'm', name: 'Moss', colors: ['#334422'] });
    await studio.savePalette({ id: 'd', name: 'Dusk', colors: ['#221133', '#ffaa88'] });
    await studio.savePalette({ id: 'm', name: 'Moss', colors: ['#334422', '#667744'] });
    await studio.savePalette({ id: 'x', name: 'Extra', colors: ['#ffffff'] });
    await studio.deletePalette('x');
    expect(ready(studio).palettes.map((p) => p.name)).toEqual(['Dusk', 'Moss']);

    expect(ready(await openStudio(indexedDB)).palettes).toEqual([
      { id: 'd', name: 'Dusk', colors: ['#221133', '#ffaa88'] },
      { id: 'm', name: 'Moss', colors: ['#334422', '#667744'] },
    ]);
  });

  it('refuses to save a palette that breaks the custom palette rules', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    await expect(
      studio.savePalette({ id: 'p', name: 'Moss', colors: ['#334422', '#334422'] }),
    ).rejects.toThrow(RangeError);
    expect(await openStore(indexedDB).listCustomPalettes()).toEqual([]);
  });

  it('refuses a palette save that storage cannot hold, keeping the palettes it had', async () => {
    const studio = await openStudio(new IDBFactory());
    await studio.savePalette({ id: 'm', name: 'Moss', colors: ['#334422'] });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    await expect(
      studio.savePalette({ id: 'm', name: 'Moss', colors: ['#000000'] }),
    ).rejects.toMatchObject({ problem: 'full' });
    expect(ready(studio).palettes).toEqual([{ id: 'm', name: 'Moss', colors: ['#334422'] }]);
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

  it('saves a drawing whose save failed once storage works again, warning until then', async () => {
    const indexedDB = new IDBFactory();
    const studio = await openStudio(indexedDB);
    const firstId = ready(studio).current.id;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
    await studio.flush();
    put.mockRestore();

    studio.create({ ...blank(1, 1), pixels: [0] });
    await studio.flush();
    expect(ready(studio).problem).toBeNull();
    const reloaded = await openStudio(indexedDB);
    const saved = ready(reloaded).drawings.find((d) => d.id === firstId);
    expect(saved?.drawing.pixels).toEqual([1, _, _, _, _, _]);
  });
});
