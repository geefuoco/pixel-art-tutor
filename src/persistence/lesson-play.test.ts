import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TRANSPARENT as _, type Drawing } from '../core/drawing';
import { createLesson, type Lesson } from '../core/lesson';
import { spriteOf } from '../core/test-grids';
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

async function play(indexedDB: IDBFactory | undefined, lesson = POT, now = () => 1000) {
  const p = createLessonPlay({ store: openStore(indexedDB), lesson, mode: 'trace', now });
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

    expect(await pot.finish()).toEqual({ score: 1, passed: true });
    expect(ready(pot).result).toEqual({ score: 1, passed: true });
    const attempts = await openStore(indexedDB).listAttempts();
    expect(attempts).toEqual([
      {
        id: expect.any(String),
        lessonId: 'pot',
        mode: 'trace',
        drawing: drawingOf(pot),
        score: 1,
        finishedAt: 5000,
      },
    ]);
    expect(drawingOf(await play(indexedDB)).pixels.every((p) => p === _)).toBe(true);
  });

  it('keeps a finished drawing that did not pass, to carry on as a new in-progress Attempt', async () => {
    const indexedDB = new IDBFactory();
    const pot = await play(indexedDB);
    draw(pot, 0, 0, 3);
    expect(await pot.finish()).toEqual({ score: 0.5, passed: false });

    pot.dismissResult();
    expect(ready(pot).result).toBeNull();
    draw(pot, 1, 1);
    await pot.flush();
    expect(firstRow(drawingOf(await play(indexedDB)))).toEqual([0, 1, _, 0, _, _, _, _]);
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

  it('can still be played when storage is unavailable, and says so', async () => {
    const pot = await play(undefined);
    expect(ready(pot).problem).toBe('unavailable');
    draw(pot, 0, 0, 3);
    draw(pot, 1, 1, 2);
    expect(await pot.finish()).toEqual({ score: 1, passed: true });
    expect(ready(pot).problem).toBe('unavailable');
  });
});
