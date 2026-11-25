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
    expect(await target.studio.restore(file)).toEqual({
      ok: true,
      drawingCount: 2,
      paletteCount: 0,
    });

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

  it('restores custom palettes along with the drawings, replacing the ones there were', async () => {
    const source = await twoDrawings();
    await source.studio.savePalette({ id: 'p', name: 'Moss', colors: ['#334422', '#667744'] });
    const backup = await source.studio.backup();

    const target = await openStudio(new IDBFactory());
    await target.studio.savePalette({ id: 'q', name: 'Gone', colors: ['#000000'] });
    expect(await target.studio.restore(backup)).toEqual({
      ok: true,
      drawingCount: 2,
      paletteCount: 1,
    });

    const restored = [{ id: 'p', name: 'Moss', colors: ['#334422', '#667744'] }];
    expect(ready(target.studio).palettes).toEqual(restored);
    expect(await target.store.listCustomPalettes()).toEqual(restored);
  });

  const valid = {
    format: 'pixel-art-tutor-backup',
    version: 2,
    studioDrawings: [
      {
        id: 'a',
        updatedAt: 5,
        drawing: { width: 2, height: 1, palette: PALETTE, pixels: [1, _] },
      },
    ],
    customPalettes: [{ id: 'p', name: 'Moss', colors: ['#334422', '#667744'] }],
  };
  const withDrawing = (drawing: object) =>
    JSON.stringify({ ...valid, studioDrawings: [{ ...valid.studioDrawings[0], drawing }] });
  const withPalette = (palette: object) =>
    JSON.stringify({ ...valid, customPalettes: [{ ...valid.customPalettes[0], ...palette }] });
  const version3 = {
    ...valid,
    version: 3,
    attempts: [
      {
        id: 't',
        lessonId: 'pot',
        mode: 'trace',
        drawing: { width: 2, height: 1, palette: PALETTE, pixels: [1, 0] },
        score: 0.5,
        finishedAt: 7,
      },
    ],
    inProgressAttempts: [
      {
        lessonId: 'pot',
        mode: 'trace',
        drawing: { width: 2, height: 1, palette: PALETTE, pixels: [_, 1] },
        updatedAt: 9,
      },
    ],
  };
  const withAttempt = (attempt: object) =>
    JSON.stringify({ ...version3, attempts: [{ ...version3.attempts[0], ...attempt }] });
  const version4 = {
    ...version3,
    version: 4,
    progress: [{ lessonId: 'pot', passedModes: ['trace', 'hint'] }],
  };
  const withProgress = (progress: object) =>
    JSON.stringify({ ...version4, progress: [{ ...version4.progress[0], ...progress }] });
  const version5 = {
    ...version4,
    version: 5,
    attempts: [{ ...version3.attempts[0]!, mode: 'hint', hintFlashes: 2 }],
    inProgressAttempts: [{ ...version3.inProgressAttempts[0]!, mode: 'hint', hintFlashes: 1 }],
  };
  const withFlashes = (hintFlashes: unknown) =>
    JSON.stringify({ ...version5, attempts: [{ ...version5.attempts[0], hintFlashes }] });
  const version6 = {
    ...version5,
    version: 6,
    attempts: [{ ...version5.attempts[0]!, inGallery: true }],
  };
  const withInGallery = (inGallery: unknown) =>
    JSON.stringify({ ...version6, attempts: [{ ...version6.attempts[0], inGallery }] });
  const version7 = {
    ...version6,
    version: 7,
    attempts: [
      ...version6.attempts,
      {
        ...version6.attempts[0]!,
        id: 'f',
        mode: 'freehand',
        score: 0.8,
        subScores: { shape: 0.9, palette: 0.6, lineQuality: 0.9 },
      },
    ],
  };
  const jarPixels = [...[1, 0, 0, 1, 2, 2, 0, 1], ...Array<number>(56).fill(_)];
  const version8 = {
    ...version7,
    version: 8,
    personalLessons: [
      {
        id: 'personal-1',
        title: 'Jar',
        reference: {
          width: 8,
          height: 8,
          palette: ['#1a1a2e', '#cc3333', '#881c1c'],
          pixels: jarPixels,
        },
        roles: ['outline', 'base', 'shadow'],
        createdAt: 9,
      },
    ],
  };
  const withPersonalLesson = (changes: object) =>
    JSON.stringify({
      ...version8,
      personalLessons: [{ ...version8.personalLessons[0], ...changes }],
    });
  const withSubScores = (subScores: unknown) =>
    JSON.stringify({ ...version7, attempts: [{ ...version7.attempts[1], subScores }] });
  const thirtyThree = Array.from(
    { length: 33 },
    (_, i) => `#0000${i.toString(16).padStart(2, '0')}`,
  );

  it.each([
    ['cut short', '{"format": "pixel-art-tutor-backup", "vers', /could not be read.*damaged/],
    ['some other JSON', JSON.stringify({ hello: 'world' }), /not a Pixel Art Tutor backup/],
    ['from a newer app', JSON.stringify({ ...valid, version: 9 }), /newer version/],
    [
      'a Personal Lesson with a color that has no Role',
      withPersonalLesson({ roles: ['outline', 'base'] }),
      /damaged/,
    ],
    [
      'a Personal Lesson with a Role that is not one',
      withPersonalLesson({ roles: ['outline', 'base', 'glow'] }),
      /damaged/,
    ],
    [
      'a Personal Lesson that is not a Lesson size',
      withPersonalLesson({
        reference: { width: 3, height: 1, palette: ['#1a1a2e'], pixels: [0, 0, 0] },
        roles: ['outline'],
      }),
      /damaged/,
    ],
    ['a Personal Lesson without a title', withPersonalLesson({ title: '' }), /damaged/],
    [
      'two Personal Lessons with the same id',
      JSON.stringify({
        ...version8,
        personalLessons: [...version8.personalLessons, ...version8.personalLessons],
      }),
      /damaged/,
    ],
    [
      'an Attempt with a sub-score above 100%',
      withSubScores({ shape: 1.5, palette: 1, lineQuality: 1 }),
      /damaged/,
    ],
    ['an Attempt missing a sub-score', withSubScores({ shape: 1, palette: 1 }), /damaged/],
    ['an Attempt not saying whether it is in the Gallery', withInGallery(undefined), /damaged/],
    ['an Attempt in the Gallery as a string', withInGallery('yes'), /damaged/],
    ['progress in an unknown Mode', withProgress({ passedModes: ['speedrun'] }), /damaged/],
    ['progress with no Lesson', withProgress({ lessonId: '' }), /damaged/],
    [
      'progress with a Mode passed twice',
      withProgress({ passedModes: ['trace', 'trace'] }),
      /damaged/,
    ],
    ['progress passing Hint without Trace', withProgress({ passedModes: ['hint'] }), /damaged/],
    [
      'progress for one Lesson twice',
      JSON.stringify({ ...version4, progress: [...version4.progress, ...version4.progress] }),
      /damaged/,
    ],
    ['an Attempt in an unknown Mode', withAttempt({ mode: 'speedrun' }), /damaged/],
    ['an Attempt scored over 100%', withAttempt({ score: 1.5 }), /damaged/],
    ['an Attempt with no Lesson', withAttempt({ lessonId: '' }), /damaged/],
    ['an Attempt without its date', withAttempt({ finishedAt: undefined }), /damaged/],
    ['an Attempt without its flash count', withFlashes(undefined), /damaged/],
    ['an Attempt with a negative flash count', withFlashes(-1), /damaged/],
    ['an Attempt with a fractional flash count', withFlashes(1.5), /damaged/],
    [
      'an in-progress Attempt without its flash count',
      JSON.stringify({
        ...version5,
        inProgressAttempts: [{ ...version5.inProgressAttempts[0], hintFlashes: undefined }],
      }),
      /damaged/,
    ],
    [
      'two in-progress Attempts for one Lesson and Mode',
      JSON.stringify({
        ...version3,
        inProgressAttempts: [...version3.inProgressAttempts, ...version3.inProgressAttempts],
      }),
      /damaged/,
    ],
    ['missing its drawings', JSON.stringify({ format: valid.format, version: 1 }), /damaged/],
    ['missing its palettes', JSON.stringify({ ...valid, customPalettes: undefined }), /damaged/],
    ['a palette with no colors', withPalette({ colors: [] }), /damaged/],
    ['a palette with 33 colors', withPalette({ colors: thirtyThree }), /damaged/],
    ['a palette with a color twice', withPalette({ colors: ['#334422', '#334422'] }), /damaged/],
    ['a palette color that is not a hex color', withPalette({ colors: ['green'] }), /damaged/],
    ['a palette without a name', withPalette({ name: undefined }), /damaged/],
    [
      'two palettes with the same id',
      JSON.stringify({
        ...valid,
        customPalettes: [...valid.customPalettes, ...valid.customPalettes],
      }),
      /damaged/,
    ],
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
    expect(await studio.restore(JSON.stringify(valid))).toEqual({
      ok: true,
      drawingCount: 1,
      paletteCount: 1,
    });
    expect(await store.listStudioDrawings()).toEqual(valid.studioDrawings);
    expect(await store.listCustomPalettes()).toEqual(valid.customPalettes);
  });

  it('restores Attempts and in-progress Attempts with their flash counts along with the rest', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    expect(await studio.restore(JSON.stringify(version6))).toMatchObject({ ok: true });
    expect(await store.listAttempts()).toEqual(version6.attempts);
    expect(await store.getInProgressAttempt('pot', 'hint')).toEqual(version6.inProgressAttempts[0]);

    const again = await openStudio(new IDBFactory());
    await again.studio.restore(await studio.backup());
    expect(await again.store.readAll()).toEqual(await store.readAll());
  });

  it('restores Freehand Attempts with their sub-scores', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    expect(await studio.restore(JSON.stringify(version7))).toMatchObject({ ok: true });
    expect(await store.listAttempts()).toEqual(expect.arrayContaining(version7.attempts));

    const again = await openStudio(new IDBFactory());
    await again.studio.restore(await studio.backup());
    expect(await again.store.readAll()).toEqual(await store.readAll());
  });

  it('restores Personal Lessons along with the rest', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    expect(await studio.restore(JSON.stringify(version8))).toMatchObject({ ok: true });
    expect(await store.listPersonalLessons()).toEqual(version8.personalLessons);

    const again = await openStudio(new IDBFactory());
    await again.studio.restore(await studio.backup());
    expect(await again.store.readAll()).toEqual(await store.readAll());
  });

  it('restores a version 7 backup, made before Personal Lessons, as having none', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    await studio.restore(JSON.stringify(version8));
    expect(await studio.restore(JSON.stringify(version7))).toMatchObject({ ok: true });
    expect(await store.listPersonalLessons()).toEqual([]);
  });

  it('restores progress along with the rest, replacing the progress there was', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    await store.saveAttempt(
      { ...version6.attempts[0]!, mode: 'trace', id: 'x', lessonId: 'jar', score: 1 },
      { passed: true },
    );
    expect(await studio.restore(JSON.stringify(version4))).toMatchObject({ ok: true });
    expect(await store.listProgress()).toEqual(version4.progress);

    const again = await openStudio(new IDBFactory());
    await again.studio.restore(await studio.backup());
    expect(await again.store.listProgress()).toEqual(version4.progress);
  });

  it('restores a version 4 backup, made before Hint flashes were counted, as having none', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    expect(await studio.restore(JSON.stringify(version4))).toMatchObject({ ok: true });
    expect(await store.listAttempts()).toEqual([
      { ...version4.attempts[0], hintFlashes: 0, inGallery: false },
    ]);
    expect(await store.getInProgressAttempt('pot', 'trace')).toEqual({
      ...version4.inProgressAttempts[0],
      hintFlashes: 0,
    });
  });

  it('puts the passing Attempts of a version 5 backup, made before the Gallery, in it', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    const passing = { ...version5.attempts[0]!, id: 'p', score: 0.95, finishedAt: 1 };
    const file = { ...version5, attempts: [...version5.attempts, passing] };
    expect(await studio.restore(JSON.stringify(file))).toMatchObject({ ok: true });
    expect((await store.listAttempts()).map((a) => [a.id, a.inGallery])).toEqual([
      ['t', false],
      ['p', true],
    ]);
  });

  it('works out the progress of a version 3 backup, made before progress was kept, from its passing Attempts', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    const passing = { ...version3.attempts[0]!, id: 'p', lessonId: 'jar', score: 0.95 };
    const file = { ...version3, attempts: [...version3.attempts, passing] };
    expect(await studio.restore(JSON.stringify(file))).toMatchObject({ ok: true });
    expect(await store.listProgress()).toEqual([{ lessonId: 'jar', passedModes: ['trace'] }]);
  });

  it('restores a version 2 backup, made before Attempts, as having none', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    await studio.restore(JSON.stringify(version3));
    expect(await studio.restore(JSON.stringify(valid))).toMatchObject({ ok: true });
    expect(await store.listAttempts()).toEqual([]);
    expect(await store.getInProgressAttempt('pot', 'trace')).toBeUndefined();
  });

  it('restores a version 1 backup, made before custom palettes, as having none', async () => {
    const { store, studio } = await openStudio(new IDBFactory());
    await studio.savePalette({ id: 'q', name: 'Gone', colors: ['#000000'] });
    const version1 = { format: valid.format, version: 1, studioDrawings: valid.studioDrawings };

    expect(await studio.restore(JSON.stringify(version1))).toEqual({
      ok: true,
      drawingCount: 1,
      paletteCount: 0,
    });
    expect(await store.listStudioDrawings()).toEqual(valid.studioDrawings);
    expect(await store.listCustomPalettes()).toEqual([]);
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
