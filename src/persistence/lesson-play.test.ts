import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TRANSPARENT as _, type Drawing } from '../core/drawing';
import { createLesson, type Lesson, type Mode } from '../core/lesson';
import { spriteOf } from '../core/test-grids';
import { createCourseProgress } from './course-progress';
import { createLessonPlay, type LessonPlay } from './lesson-play';
import { openStore } from './store';

const PALETTE = ['#111111', '#cc3333'];

function lessonOf(id: string): Lesson {
  return createLesson({
    id,
    title: id,
    roles: ['outline', 'base'],
    explanations: { silhouette: '', outline: '', base: '' },
    reference: spriteOf(
      [
        'OBBO....',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
      ],
      'OB',
      PALETTE,
    ),
  });
}

const POT = lessonOf('pot');

async function play(
  indexedDB: IDBFactory | undefined,
  lesson = POT,
  now = () => 1000,
  mode: Mode = 'trace',
) {
  const store = openStore(indexedDB);
  const progress = createCourseProgress({ store });
  const p = createLessonPlay({ store, lesson, mode, progress, now });
  await p.load();
  return p;
}

function ready(p: LessonPlay) {
  const state = p.getState();
  if (state.status !== 'ready') throw new Error('The Lesson has not loaded');
  return state;
}

const drawingOf = (p: LessonPlay): Drawing => ready(p).editor.getState().drawing;

function draw(p: LessonPlay, color: number, ...xs: number[]) {
  for (const x of xs) ready(p).editor.apply({ type: 'pencil', color, points: [{ x, y: 0 }] });
}

const firstRow = (d: Drawing) => d.pixels.slice(0, 8);

describe('playing a Lesson', () => {
  it('starts on a blank canvas the size of the Lesson, in its fixed palette', async () => {
    const drawing = drawingOf(await play(new IDBFactory()));
    expect([drawing.width, drawing.height, drawing.palette]).toEqual([8, 8, PALETTE]);
    expect(drawing.pixels.every((p) => p === _)).toBe(true);
  });

  it('autosaves the in-progress Attempt and resumes it after a reload, one per Lesson and Mode', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    const jar = await play(indexedDB, lessonOf('jar'));
    draw(jar, 1, 1);
    await Promise.all([pot.flush(), jar.flush()]);

    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, _, _, 0, _, _, _, _]);
    expect(firstRow(drawingOf(await play(indexedDB, lessonOf('jar'))))).toEqual([
      _,
      1,
      _,
      _,
      _,
      _,
      _,
      _,
    ]);
    expect(ready(await play(indexedDB)).editor.getState().canUndo).toBe(false);
  });

  it('finishing saves the Attempt with its Lesson, Mode, drawing, score and date', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 5000);
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);

    expect(await pot.finish()).toEqual({ score: 1, passed: true, hintFlashes: 0, inGallery: true });
    expect(ready(pot).result).toEqual({ score: 1, passed: true, hintFlashes: 0, inGallery: true });
    const attempts = await openStore(indexedDB).listAttempts();
    expect(attempts).toEqual([
      {
        id: expect.any(String),
        lessonId: 'pot',
        mode: 'trace',
        drawing: {
          width: 8,
          height: 8,
          palette: PALETTE,
          pixels: [0, 1, 1, 0, ...new Array<number>(60).fill(_)],
        },
        score: 1,
        hintFlashes: 0,
        inGallery: true,
        finishedAt: 5000,
      },
    ]);
    expect(drawingOf(await play(indexedDB)).pixels.every((p) => p === _)).toBe(true);
  });

  it('keeps a drawing that did not pass in progress, saving the Attempt too', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    expect(await pot.finish()).toMatchObject({ score: 0.5, passed: false });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([{ score: 0.5 }]);
    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, _, _, 0, _, _, _, _]);

    pot.dismissResult();
    expect(ready(pot).result).toBeNull();
    draw(pot, 1, 1);
    await pot.flush();
    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, 1, _, 0, _, _, _, _]);
  });

  it('saves a finished Attempt that did not pass to the Gallery on request', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    expect(await pot.finish()).toMatchObject({ passed: false, inGallery: false });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([{ inGallery: false }]);

    await pot.saveToGallery();

    expect(ready(pot).result).toMatchObject({ score: 0.5, passed: false, inGallery: true });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      { score: 0.5, inGallery: true },
    ]);
  });

  it('starting over clears the drawing and the in-progress Attempt', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0);
    await pot.startOver();
    expect(drawingOf(pot).pixels.every((p) => p === _)).toBe(true);
    expect(drawingOf(await play(indexedDB)).pixels.every((p) => p === _)).toBe(true);
    expect(await openStore(indexedDB).listAttempts()).toEqual([]);
  });

  it('counts each Guide flash in Hint on the Attempt, without lowering its score', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 1000, 'hint');
    expect(ready(pot).hintFlashes).toBe(0);
    pot.flashGuide();
    pot.flashGuide();
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);
    pot.flashGuide();
    expect(ready(pot).hintFlashes).toBe(3);

    expect(await pot.finish()).toEqual({ score: 1, passed: true, hintFlashes: 3, inGallery: true });
    pot.flashGuide();
    expect(ready(pot).result).toEqual({ score: 1, passed: true, hintFlashes: 3, inGallery: true });
    expect(await openStore(indexedDB).listAttempts()).toMatchObject([
      { mode: 'hint', score: 1, hintFlashes: 3 },
    ]);
  });

  it('keeps the flash count of an in-progress Attempt across a reload, until starting over', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB, POT, () => 1000, 'hint');
    pot.flashGuide();
    pot.flashGuide();
    await pot.flush();

    const resumed = await play(indexedDB, POT, () => 1000, 'hint');
    expect(ready(resumed).hintFlashes).toBe(2);
    expect(ready(await play(indexedDB)).hintFlashes).toBe(0);

    await resumed.startOver();
    expect(ready(resumed).hintFlashes).toBe(0);
    expect(ready(await play(indexedDB, POT, () => 1000, 'hint')).hintFlashes).toBe(0);
  });

  it('can still be played when storage is unavailable, and says so', async () => {
    const pot = await play(undefined);
    expect(ready(pot).problem).toBe('unavailable');
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);
    expect(await pot.finish()).toMatchObject({ score: 1, passed: true, inGallery: false });
    expect(ready(pot).problem).toBe('unavailable');
    await pot.saveToGallery();
    expect(ready(pot).result).toMatchObject({ inGallery: false });
  });
});
