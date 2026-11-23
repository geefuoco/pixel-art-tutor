import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawing, TRANSPARENT as _ } from '../core/drawing';
import { createBackup } from './backup';
import { openStore } from './store';
import { createStudio, type Studio } from './studio';

const PALETTE = ['#000000', '#ff0000'];

function blank(width: number, height: number) {
  return createDrawing({ width, height, palette: PALETTE });
}

async function openStudio(indexedDB: IDBFactory) {
  const store = openStore(indexedDB);
  const studio = createStudio({ store, firstDrawing: blank(3, 2), now: clock() });
  await studio.load();
  return { store, studio };
}

function clock() {
  let time = 1000;
  return () => (time += 10);
}

function ready(studio: Studio) {
  const state = studio.getState();
  if (state.status !== 'ready') throw new Error('The Studio has not loaded');
  return state;
}

async function twoDrawings() {
  const { store, studio } = await openStudio(new IDBFactory());
  ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 0, y: 0 }] });
  studio.create({ ...blank(1, 2), pixels: [0, _] });
  await studio.flush();
  return { store, studio };
}

describe('backup and restore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('restores a backup into an empty store, reproducing every drawing', async () => {
    const source = await twoDrawings();
    const file = await createBackup(source.store);

    const target = await openStudio(new IDBFactory());
    expect(await target.studio.restore(file)).toEqual({ ok: true, drawingCount: 2 });

    const expected = [
      { width: 1, height: 2, palette: PALETTE, pixels: [0, _] },
      { width: 3, height: 2, palette: PALETTE, pixels: [1, _, _, _, _, _] },
    ];
    expect((await target.store.listStudioDrawings()).map((d) => d.drawing)).toEqual(expected);
    expect(ready(target.studio).drawings.map((d) => d.drawing)).toEqual(expected);
    expect(ready(target.studio).current.editor.getState().drawing).toEqual(expected[0]);
    expect(await target.store.listStudioDrawings()).toEqual(
      await source.store.listStudioDrawings(),
    );
  });

  it('replaces the current drawings with the backup, not merging them', async () => {
    const backup = await createBackup((await twoDrawings()).store);
    const { store, studio } = await openStudio(new IDBFactory());
    const replacedId = ready(studio).current.id;
    ready(studio).current.editor.apply({ type: 'pencil', color: 0, points: [{ x: 2, y: 1 }] });

    await studio.restore(backup);

    const ids = (await store.listStudioDrawings()).map((d) => d.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(replacedId);
    expect(ready(studio).drawings.map((d) => d.id)).toEqual(ids);
  });

  const valid = {
    format: 'pixel-art-tutor-backup',
    version: 1,
    studioDrawings: [
      {
        id: 'a',
        updatedAt: 5,
        drawing: { width: 2, height: 1, palette: PALETTE, pixels: [1, _] },
      },
    ],
  };
  const withDrawing = (drawing: object) =>
    JSON.stringify({ ...valid, studioDrawings: [{ ...valid.studioDrawings[0], drawing }] });

  it.each([
    ['cut short', '{"format": "pixel-art-tutor-backup", "vers', /could not be read.*damaged/],
    ['some other JSON', JSON.stringify({ hello: 'world' }), /not a Pixel Art Tutor backup/],
    ['from a newer app', JSON.stringify({ ...valid, version: 2 }), /newer version/],
    ['missing its drawings', JSON.stringify({ format: valid.format, version: 1 }), /damaged/],
    [
      'a drawing with too few pixels',
      withDrawing({ width: 2, height: 1, palette: PALETTE, pixels: [1] }),
      /damaged/,
    ],
    [
      'a pixel outside the palette',
      withDrawing({ width: 2, height: 1, palette: PALETTE, pixels: [2, _] }),
      /damaged/,
    ],
    [
      'a drawing over 64 pixels wide',
      withDrawing({ width: 65, height: 1, palette: PALETTE, pixels: Array(65).fill(_) }),
      /damaged/,
    ],
    [
      'a color that is not a hex color',
      withDrawing({ width: 2, height: 1, palette: ['red', '#ff0000'], pixels: [1, _] }),
      /damaged/,
    ],
    [
      'two drawings with the same id',
      JSON.stringify({
        ...valid,
        studioDrawings: [...valid.studioDrawings, ...valid.studioDrawings],
      }),
      /damaged/,
    ],
  ])(
    'rejects a file that is %s, leaving the current data unchanged',
    async (_name, text, message) => {
      const { store, studio } = await twoDrawings();
      const before = await store.listStudioDrawings();
      const stateBefore = studio.getState();

      const outcome = await studio.restore(text);

      expect(outcome).toEqual({ ok: false, message: expect.stringMatching(message) });
      expect(await store.listStudioDrawings()).toEqual(before);
      expect(studio.getState()).toBe(stateBefore);
    },
  );

  it('accepts the hand-written valid file the rejected ones are variations of', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    expect(await studio.restore(JSON.stringify(valid))).toEqual({ ok: true, drawingCount: 1 });
    expect(await store.listStudioDrawings()).toEqual(valid.studioDrawings);
  });

  it('keeps the current data when storage fills up partway through a restore', async () => {
    const backup = await createBackup((await twoDrawings()).store);
    const { store, studio } = await twoDrawings();
    const before = await store.listStudioDrawings();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    const outcome = await studio.restore(backup);
    vi.restoreAllMocks();

    expect(outcome).toEqual({
      ok: false,
      message: expect.stringMatching(/too full/),
    });
    expect(await store.listStudioDrawings()).toEqual(before);
  });

  it('includes an edit made just before the backup, without waiting for autosave', async () => {
    const { studio } = await openStudio(new IDBFactory());
    ready(studio).current.editor.apply({ type: 'pencil', color: 1, points: [{ x: 2, y: 1 }] });
    const backup = await studio.backup();

    const target = await openStudio(new IDBFactory());
    await target.studio.restore(backup);
    expect(ready(target.studio).current.editor.getState().drawing.pixels).toEqual([
      _,
      _,
      _,
      _,
      _,
      1,
    ]);
  });

  it('does not save an edit to the replaced drawing that lands while a restore runs', async () => {
    const backup = await createBackup((await twoDrawings()).store);
    const store = openStore(new IDBFactory());
    let editDuringRestore = () => {};
    const studio = createStudio({
      store: {
        ...store,
        replaceAll(contents) {
          const replacing = store.replaceAll(contents);
          editDuringRestore();
          return replacing;
        },
      },
      firstDrawing: blank(3, 2),
    });
    await studio.load();
    const replaced = ready(studio).current.editor;
    editDuringRestore = () =>
      replaced.apply({ type: 'pencil', color: 0, points: [{ x: 0, y: 0 }] });

    await studio.restore(backup);
    await studio.flush();

    expect((await store.listStudioDrawings()).map((d) => d.drawing.width)).toEqual([1, 3]);
  });
});
