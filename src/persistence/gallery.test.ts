import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { stillAnimation } from '../core/animation';
import { createDrawing, type Drawing } from '../core/drawing';
import type { Mode } from '../core/lesson';
import { createGallery, type Gallery } from './gallery';
import { openStore, type Attempt } from './store';

const PALETTE = ['#000000', '#ff0000'];

function drawingOf(...pixels: number[]): Drawing {
  return { ...createDrawing({ width: pixels.length, height: 1, palette: PALETTE }), pixels };
}

function attempt(
  id: string,
  finishedAt: number,
  fields: Partial<Attempt> & { lessonId?: string; mode?: Mode } = {},
): Attempt {
  return {
    id,
    lessonId: 'pot',
    mode: 'trace',
    drawing: drawingOf(1),
    score: 1,
    hintFlashes: 0,
    inGallery: true,
    finishedAt,
    ...fields,
  };
}

function ready(gallery: Gallery) {
  const state = gallery.getState();
  if (state.status !== 'ready') throw new Error('The Gallery has not loaded');
  return state;
}

async function galleryOver(indexedDB: IDBFactory | undefined) {
  const gallery = createGallery({ store: openStore(indexedDB) });
  await gallery.refresh();
  return gallery;
}

describe('the Gallery', () => {
  it('shows the Attempts in the Gallery and every Studio drawing, newest first', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    await store.putStudioDrawing({
      id: 's1',
      animation: stillAnimation(drawingOf(0)),
      updatedAt: 10,
    });
    await store.putStudioDrawing({
      id: 's2',
      animation: stillAnimation(drawingOf(0, 1)),
      updatedAt: 40,
    });
    await store.saveAttempt(attempt('passed', 30, { mode: 'hint', hintFlashes: 2 }), {
      passed: true,
    });
    await store.saveAttempt(attempt('failed', 20, { score: 0.5, inGallery: false }), {
      passed: false,
    });

    expect(ready(await galleryOver(indexedDB)).entries).toEqual([
      {
        kind: 'studio',
        date: 40,
        studioDrawing: { id: 's2', animation: stillAnimation(drawingOf(0, 1)), updatedAt: 40 },
      },
      {
        kind: 'attempt',
        date: 30,
        attempt: {
          id: 'passed',
          lessonId: 'pot',
          mode: 'hint',
          drawing: drawingOf(1),
          score: 1,
          hintFlashes: 2,
          inGallery: true,
          finishedAt: 30,
        },
      },
      {
        kind: 'studio',
        date: 10,
        studioDrawing: { id: 's1', animation: stillAnimation(drawingOf(0)), updatedAt: 10 },
      },
    ]);
  });

  it('shows every Attempt at a Lesson together, in the Gallery or not, oldest first', async () => {
    const indexedDB = new IDBFactory();
    const store = openStore(indexedDB);
    await store.saveAttempt(attempt('3', 300, { mode: 'hint' }), { passed: true });
    await store.saveAttempt(attempt('1', 100, { score: 0.2, inGallery: false }), {
      passed: false,
    });
    await store.saveAttempt(attempt('j', 150, { lessonId: 'jar' }), { passed: true });
    await store.saveAttempt(attempt('2', 200), { passed: true });

    const { attemptsByLesson } = ready(await galleryOver(indexedDB));
    expect(attemptsByLesson.get('pot')?.map((a) => [a.id, a.score, a.inGallery])).toEqual([
      ['1', 0.2, false],
      ['2', 1, true],
      ['3', 1, true],
    ]);
    expect(attemptsByLesson.get('jar')?.map((a) => a.id)).toEqual(['j']);
    expect(attemptsByLesson.get('cup')).toBeUndefined();
  });

  it('saves an Attempt to the Gallery from the Attempts at its Lesson', async () => {
    const indexedDB = new IDBFactory();
    await openStore(indexedDB).saveAttempt(attempt('1', 100, { score: 0.5, inGallery: false }), {
      passed: false,
    });
    const gallery = await galleryOver(indexedDB);
    expect(ready(gallery).entries).toEqual([]);

    await gallery.saveAttemptToGallery('1');

    expect(ready(gallery).entries).toMatchObject([
      { kind: 'attempt', attempt: { id: '1', score: 0.5 } },
    ]);
    expect(ready(gallery).attemptsByLesson.get('pot')).toMatchObject([{ inGallery: true }]);
    expect(ready(await galleryOver(indexedDB)).entries).toMatchObject([{ attempt: { id: '1' } }]);
  });

  it('shows what has been saved since it last looked when it looks again', async () => {
    const indexedDB = new IDBFactory();
    const gallery = await galleryOver(indexedDB);
    await openStore(indexedDB).putStudioDrawing({
      id: 's',
      animation: stillAnimation(drawingOf(1)),
      updatedAt: 1,
    });
    expect(ready(gallery).entries).toEqual([]);

    await gallery.refresh();

    expect(ready(gallery).entries).toMatchObject([{ kind: 'studio', studioDrawing: { id: 's' } }]);
  });

  it('says so when storage is unavailable, showing nothing', async () => {
    const state = ready(await galleryOver(undefined));
    expect(state.problem).toBe('unavailable');
    expect(state.entries).toEqual([]);
  });
});
